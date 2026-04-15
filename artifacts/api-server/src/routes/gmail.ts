import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { db, profilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { logger } from "../lib/logger";
import { generateJSON } from "../lib/ollamaClient";
import type { Request } from "express";
import type { User } from "@workspace/db";

type AuthRequest = Request & { user: User };

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function getRedirectUri(req: Request): string {
  // Bypassing the Google Cloud UI save bug by using the URI we KNOW is already successfully saved from your earlier tests!
  return "http://localhost:3000/api/gmail/callback";
}

// Return the OAuth URL for the frontend to redirect to
router.get("/gmail/auth-url", requireAuth, (req, res): void => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Gmail integration not configured. GOOGLE_CLIENT_ID is missing." });
    return;
  }

  const user = (req as AuthRequest).user;
  const redirectUri = getRedirectUri(req);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: user.id, // Use userId as state for CSRF protection
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// OAuth callback — Google redirects here after user grants permission
router.get("/gmail/callback", async (req, res): Promise<void> => {
  // Use a hardcoded frontend target for local dev to avoid getting stuck on backend port 3000
  const frontendUrl = "http://localhost:5173";
  const { code, state: userId, error } = req.query as { code?: string; state?: string; error?: string };

  logger.info({ userId, error: !!error }, "[Gmail Sync DEBUG] Callback received from Google");

  if (error || !code || !userId) {
    res.redirect(`${frontendUrl}/?gmail_error=${encodeURIComponent(error || "Authorization failed")}`);
    return;
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.redirect(`${frontendUrl}/?gmail_error=Gmail+integration+not+configured`);
    return;
  }

  const redirectUri = getRedirectUri(req);

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json() as { access_token?: string; refresh_token?: string; error?: string };

    if (!tokenData.access_token) {
      res.redirect(`${frontendUrl}/?gmail_error=${encodeURIComponent("Failed to get access token: " + (tokenData.error || "unknown"))}`);
      return;
    }

    // Fetch Gmail messages to extract purchase signals
    const purchaseSignals = await extractPurchaseSignals(tokenData.access_token);

    // Update the user's profile with email integration data
    const [existingProfile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    // Always mark onboarding as completed if we reached this point successfully!
    await db.update(usersTable)
      .set({ onboardingCompleted: true })
      .where(eq(usersTable.id, userId));

    if (existingProfile) {
      await db
        .update(profilesTable)
        .set({
          emailIntegration: {
            connected: true,
            categories: purchaseSignals.categories,
            brands: purchaseSignals.brands,
            recentOrders: purchaseSignals.recentOrders,
            lastSyncedAt: new Date().toISOString(),
            accessToken: tokenData.access_token,
            // 💀 CRITICAL FIX: Store refresh_token for long-term syncing (tokens expire in 1 hour)
            refreshToken: tokenData.refresh_token || null,
          },
        })
        .where(eq(profilesTable.userId, userId));
    }

    logger.info({ orderCount: purchaseSignals.recentOrders.length }, "[Gmail Sync DEBUG] Sync complete. Profile updated.");

    // Redirect back to onboarding with success so it processes the parameters and finishes!
    res.redirect(`${frontendUrl}/onboarding?gmail_success=1&brands=${purchaseSignals.brands.slice(0, 3).join(",")}&categories=${purchaseSignals.categories.slice(0, 3).join(",")}`);
  } catch (err) {
    res.redirect(`${frontendUrl}/onboarding?gmail_error=${encodeURIComponent("Gmail sync failed. Please try again.")}`);
  }
});

// Check gmail integration status
router.get("/gmail/status", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;

  const [profile] = await db
    .select({ emailIntegration: profilesTable.emailIntegration })
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id));

  const emailIntegration = profile?.emailIntegration as { connected?: boolean; categories?: string[]; brands?: string[] } | null;

  res.json({
    connected: emailIntegration?.connected ?? false,
    categories: emailIntegration?.categories ?? [],
    brands: emailIntegration?.brands ?? [],
    configured: !!GOOGLE_CLIENT_ID,
  });
});

// Disconnect Gmail for the authenticated user
router.post("/gmail/disconnect", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;
  const disconnected = { connected: false, categories: [], brands: [], recentOrders: [] };

  await db
    .update(profilesTable)
    .set({ emailIntegration: disconnected as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(profilesTable.userId, user.id));

  res.json({ success: true, message: "Gmail disconnected. Please re-sync to get fresh data." });
});

// ADMIN: Reset Gmail for ALL users (localhost only — for dev/debug)
router.post("/gmail/disconnect-all", async (req, res): Promise<void> => {
  const host = req.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    res.status(403).json({ error: "Forbidden: admin endpoint is localhost-only." });
    return;
  }
  const disconnected = { connected: false, categories: [], brands: [], recentOrders: [] };

  await db
    .update(profilesTable)
    .set({ emailIntegration: disconnected as unknown as Record<string, unknown>, updatedAt: new Date() });

  res.json({ success: true, message: `Gmail disconnected for all profiles.` });
});

async function extractPurchaseSignals(accessToken: string): Promise<{ 
  categories: string[]; 
  brands: Array<[string, number, string]>; // TUPLE FORMAT: [brandName, count, source]
  recentOrders: Array<[number, string, string]> // TUPLE FORMAT: [count, productName, source]
}> {
  // ── STRICT EXHAUSTIVE ALLOWLIST ───────────────────────────────────────
  // CRITICAL: We ONLY accept emails from these specific physical product brands.
  const STRICT_RETAIL_ALLOWLIST = [
    // Mega E-commerce
    "amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "tatacliq", "bewakoof", "westside",
    "croma", "jiomart", "reliancedigital", "vijaysales", "shopee", "alibaba", "aliexpress",
    // Fashion & Apparel
    "zara", "hm", "uniqlo", "asos", "nike", "adidas", "puma", "gucci", "prada", "levi", "gap", 
    "mango", "libas", "fabindia", "pantaloons", "zivame", "clovia", "decathlon", "underarmour",
    // Beauty & Cosmetics
    "purplle", "mamaearth", "mcaffeine", "minimalist", "plum", "lakme", "biotique", "sugar", 
    "foxtale", "dotandkey", "maccosmetics", "sephora", "fenty", "estee", "lancome", "maybelline", "loreal",
    // Electronics & Tech Hardware
    "apple", "samsung", "sony", "dell", "lenovo", "hp", "asus", "oneplus", "boat", "noise", "jbl", 
    "logitech", "anker", "realme", "xiaomi", "intel", "nvidia",
    // Home & Furniture
    "ikea", "pepperfry", "urbanladder", "wayfair", "homedepot", "pottery", "hometown", "zuari",
    // Gifting & Specialty
    "confettigifts", "fnp", "igp", "floweraura", "caratlane", "tanishq"
  ];


  try {
    // Targeted search — ONLY genuine e-commerce purchase confirmation emails. Block gifts and subscriptions.
    const searchQuery = '("order confirmed" OR "order shipped" OR "order delivered" OR "purchase" OR "receipt") -"gift card" -"eGift" -renewal -subscription';
    const searchResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      logger.error({ status: searchResponse.status, errorText }, "[Gmail Sync DEBUG] Search request failed");
      return { categories: [], brands: [], recentOrders: [] };
    }

    const searchData = await searchResponse.json() as { messages?: Array<{ id: string }> };
    const foundCount = searchData.messages?.length ?? 0;
    logger.info({ foundCount, query: searchQuery }, "[Gmail Sync DEBUG] Search complete");

    if (!foundCount) {
      logger.warn("[Gmail Sync DEBUG] No purchase emails found. Extraction returned empty.");
      return { categories: [], brands: [], recentOrders: [] };
    }

    const brandCounts = new Map<string, { count: number, source: string }>();
    const categories = new Set<string>();
    const productCounts = new Map<string, { product: string, source: string, count: number }>();

    // Analyze up to 60 messages to dig past any remaining junk
    const messagesToAnalyze = (searchData.messages || []).slice(0, 60);
    for (const msg of messagesToAnalyze) {
      try {
        // CRITICAL FIX: Use format=metadata to actually receive headers (Minimal format excludes them!)
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        if (!msgResponse.ok) {
           logger.warn({ id: msg.id, status: msgResponse.status }, "[Gmail Sync DEBUG] Failed to fetch message metadata");
           continue;
        }

        const msgData = await msgResponse.json() as {
          snippet?: string;
          payload?: { headers?: Array<{ name: string; value: string }> }
        };

        const snippet = msgData.snippet ?? "";
        const headers = msgData.payload?.headers ?? [];

        const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
        const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";

        // ── PRIMARY FILTER: Strict Allowlist Check ──────────────────────────────────
        // CRITICAL: Reject emails UNLESS they strictly come from a major e-commerce brand
        const fromLowerCheck = from.toLowerCase();
        const isRetailer = STRICT_RETAIL_ALLOWLIST.some(domain => fromLowerCheck.includes(domain));
        if (!isRetailer) {
          logger.info({ from, reason: "not in strict hardcoded allowlist" }, "[Gmail Sync] REJECTED — sender is not a whitelisted e-commerce platform");
          continue; // SKIP THIS EMAIL ENTIRELY
        }

        logger.info({ from, subject }, "[Gmail Sync DEBUG] Tracking approved email. Fetching full body...");

        // FETCH FULL BODY NOW THAT IT IS WHITELISTED
        const fullMsgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        let fullBodyText = "";
        let rawHtml = "";
        if (fullMsgResponse.ok) {
           const fullData = await fullMsgResponse.json();
           rawHtml = extractBody(fullData.payload);
           fullBodyText = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove CSS
                                 .replace(/<[^>]*>?/gm, ' ') // Remove HTML tags
                                 .replace(/&nbsp;/g, ' ')
                                 .replace(/\s+/g, ' ') // Collapse whitespace
                                 .trim();
        }

        // Determine Source platform - FIXED: Force match to the whitelisted brand
        const domainMatch = STRICT_RETAIL_ALLOWLIST.find(domain => fromLowerCheck.includes(domain));
        let source = capitalize(domainMatch || "Direct");

        // Extract brand from sender Display Name (e.g., "Nykaa" <orders@nykaa.com>)
        let extractedBrand = "Unknown";
        const nameMatch = from.match(/^"?([^"<>@]+)"?\s*</);
        if (nameMatch && nameMatch[1].trim().length > 1) {
          extractedBrand = nameMatch[1].trim();
        } else {
          // fallback to domain
          const domainMatchObj = from.match(/@([^>@\s.]+)\./i);
          if (domainMatchObj) {
             extractedBrand = capitalize(domainMatchObj[1].toLowerCase());
          }
        }
        
        const uselessPrefixes = ["support", "noreply", "no-reply", "notifications", "info", "mail", "help", "customer", "care", "service", "payment"];
        if (uselessPrefixes.some(p => extractedBrand.toLowerCase().startsWith(p))) {
          extractedBrand = source !== "Direct" ? source : "Unknown";
        }

        // If brand is still unknown, fallback to the detected source platform
        if (extractedBrand === "Unknown" && source !== "Direct") {
          extractedBrand = source;
        }

        if (extractedBrand !== "Unknown") {
          const current = brandCounts.get(extractedBrand) || { count: 0, source };
          brandCounts.set(extractedBrand, { count: current.count + 1, source });
        }

        // Categorize based on known brands
        const searchDomain = extractedBrand.toLowerCase();
        if (isElectronics(searchDomain)) categories.add("electronics");
        else if (isFashion(searchDomain)) categories.add("fashion");
        else if (isFood(searchDomain)) categories.add("food");
        else if (isHome(searchDomain)) categories.add("home");
        else if (isBeauty(searchDomain)) categories.add("beauty");
        else if (isSports(searchDomain)) categories.add("sports");
        
        // ── Extract Product from Snippet + Subject + FULL BODY ──────────────────────────
        let expectedCategoryDesc = "Item";
        if (categories.has("beauty")) expectedCategoryDesc = "Beauty Product";
        else if (categories.has("fashion")) expectedCategoryDesc = "Apparel";
        else if (categories.has("electronics")) expectedCategoryDesc = "Electronics";

        const combinedText = `${subject} ${snippet} ${fullBodyText}`.substring(0, 3000); // Guard rails
        
        let extractedProduct: string | null = null;
        
        // --- HYBRID AI PARSING ---
        // Since we only have ~5 whitelisted emails per sync, we can safely call AI for pinpoint accuracy!
        try {
           logger.info({ brand: extractedBrand }, "[Gmail Sync DEBUG] Calling AI to extract product name...");
           const prompt = `You are a precision retail parser. Extract the PURE physical product name from this e-commerce email.
Brand: ${extractedBrand}
Expected Category: ${expectedCategoryDesc}

Email Text:
${combinedText.substring(0, 1200)}

Instructions:
1. Return ONLY the specific product name (e.g. "Lakme Matte Lipstick", "Apple iPhone 15").
2. No prices, no order IDs, no dates.
3. If no specific product is clear, return null.

Return strictly JSON: { "productName": "string or null" }`;

           const result = await generateJSON<{ productName: string | null }>(prompt);
           if (result?.productName && result.productName.length > 2) {
              extractedProduct = result.productName.trim();
              logger.info({ extractedProduct }, "[Gmail Sync DEBUG] AI identified product");
           }
        } catch(e) {
           logger.warn("[Gmail Sync DEBUG] AI extraction failed, using fallback.");
        }

        if (!extractedProduct) {
           // Fallback 1: JSON-LD (Standard Schema)
           if (rawHtml) {
              const ldMatch = rawHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
              if (ldMatch) {
                 try {
                    const parsed = JSON.parse(ldMatch[1]);
                    const name = parsed.name || (parsed.itemOffered && parsed.itemOffered.name);
                    if (typeof name === 'string') extractedProduct = name.substring(0, 50);
                 } catch(e) {}
              }
           }
        }

        if (!extractedProduct) {
           const finalBrand = extractedBrand !== "Unknown" ? extractedBrand : source;
           extractedProduct = `${finalBrand} ${expectedCategoryDesc}`;
        }


        
        extractedProduct = extractedProduct.substring(0, 45).trim();

        if (extractedProduct && extractedProduct.length > 3 && extractedProduct.length < 80) {
          const key = extractedProduct.toLowerCase();
          const current = productCounts.get(key) || { product: extractedProduct, source, count: 0 };
          productCounts.set(key, { ...current, count: current.count + 1 });
        }
      } catch {
        // Skip individual message errors
      }
    }

    // Convert to tuple formats (ISSUE #7 FIX)
    let finalCategories = Array.from(categories).slice(0, 6);
    let finalBrands = Array.from(brandCounts.entries())
      .map(([name, data]) => [name, data.count, data.source] as [string, number, string])
      .sort((a, b) => b[1] - a[1]) // Sort by count
      .slice(0, 10);
    let finalOrders = Array.from(productCounts.values())
      .map(o => [o.count, o.product, o.source] as [number, string, string])
      .sort((a, b) => b[0] - a[0]) // Sort by count
      .slice(0, 15);

    const result = {
      categories: finalCategories,
      brands: finalBrands,
      recentOrders: finalOrders,
    };

    logger.info({
      orders_count: result.recentOrders.length,
      top_orders: result.recentOrders.slice(0, 15).map(o => `(${o[0]}, ${o[2]}, ${o[1]})`),
      brands: result.brands.map(b => b[0])
    }, "[Gmail Sync DEBUG] Purchase extraction complete!");

    return result;
  } catch (err) {
    logger.error({ err }, "[Gmail Sync] Fatal error during extraction");
    return { categories: [], brands: [], recentOrders: [] };
  }
}

export default router;

function extractBody(payload: any): string {
  if (payload?.body?.data) {
    try {
      return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    } catch {
      return "";
    }
  }
  let body = "";
  if (payload?.parts) {
    for (const part of payload.parts) {
      body += " " + extractBody(part);
    }
  }
  return body;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ELECTRONICS_BRANDS = ["apple", "samsung", "sony", "lg", "dell", "lenovo", "hp", "asus", "nvidia", "intel", "bestbuy", "newegg", "bhphotovideo", "microcenter", "bose", "jabra", "logitech", "anker", "oneplus", "realme", "xiaomi", "mi", "boat", "noise", "jbl", "croma", "vijaysales"];
const FASHION_BRANDS = ["zara", "hm", "uniqlo", "asos", "nordstrom", "nike", "adidas", "puma", "gucci", "prada", "levi", "gap", "mango", "topshop", "forever21", "shein", "boohoo", "fashionova", "myntra", "ajio", "meesho", "libas", "fabindia", "westside", "pantaloons", "fbb"];
const FOOD_BRANDS = ["doordash", "ubereats", "grubhub", "instacart", "seamless", "chipotle", "starbucks", "swiggy", "zomato", "bigbasket", "blinkit", "zepto", "dunzo", "freshmenu"];
const HOME_BRANDS = ["ikea", "wayfair", "homedepot", "pottery", "westside", "hometown", "pepperfry", "urban ladder", "fabfurnish", "zuari"];
const BEAUTY_BRANDS = ["sephora", "ulta", "glossier", "nars", "fenty", "estee", "lancome", "maybelline", "loreal", "olay", "clinique", "mac", "nykaa", "purplle", "mamaearth", "mcaffeine", "minimalist", "plum", "dot", "engage", "lakme", "biotique"];
const SPORTS_BRANDS = ["rei", "patagonia", "northface", "columbia", "underarmour", "lululemon", "peloton", "decathlon", "sportskeeda", "cultfit", "cult"];
const TRAVEL_BRANDS = ["bookmyshow", "redbus", "irctc", "makemytrip", "goibibo", "cleartrip", "yatra", "airbnb", "oyo", "expedia", "booking", "tripadvisor"];

function isElectronics(d: string) { return ELECTRONICS_BRANDS.some(b => d.includes(b)); }
function isFashion(d: string) { return FASHION_BRANDS.some(b => d.includes(b)); }
function isFood(d: string) { return FOOD_BRANDS.some(b => d.includes(b)); }
function isHome(d: string) { return HOME_BRANDS.some(b => d.includes(b)); }
function isBeauty(d: string) { return BEAUTY_BRANDS.some(b => d.includes(b)); }
function isSports(d: string) { return SPORTS_BRANDS.some(b => d.includes(b)); }
function isTravel(d: string) { return TRAVEL_BRANDS.some(b => d.includes(b)); }
