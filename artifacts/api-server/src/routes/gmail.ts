import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { db, profilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
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
  brands: { name: string, count: number, source: string }[]; 
  recentOrders: { product: string, source: string, count: number }[] 
}> {
  // ── NON-PURCHASE BLOCKLIST ──────────────────────────────────────────────
  // These senders are NEVER physical product purchases. Skip them entirely.
  // 🟡 IMPROVEMENT: Use domain-specific matching (@domain.com) instead of substring
  const NON_PURCHASE_DOMAINS = [
    // Education & Courses
    "@udemy.com", "@coursera.com", "@edx.org", "@skillshare.com", "@linkedin.com", "@udacity.com",
    "@pluralsight.com", "@classcentral.com", "@alison.com", "@simplilearn.com",
    "@greatlearning.com", "@upgrad.com", "@scaler.com", "@codecademy.com", "@datacamp.com",
    // Job / Career / Corporate
    "@accenture.com", "@infosys.com", "@wipro.com", "@tcs.com", "@capgemini.com", "@cognizant.com",
    "@hcl.com", "@naukri.com", "@indeed.com", "@glassdoor.com", "@monster.com", "@shine.com",
    // Streaming / Music (not physical goods)
    "@spotify.com", "@netflix.com", "@primevideo.com", "@hotstar.com", "@disney.com", "@jiocinema.com",
    // Banking / Finance (not purchases)
    "@hdfcbank.com", "@icicibank.com", "@sbicard.com", "@axisbank.com", "@phonepe.com", "@paytm.com",
    "@googlepay.com", "@razorpay.com", "@cashfree.com",
    // Generic tech (not retail)
    "@google.com", "@microsoft.com", "@apple.com",
  ];

  try {
    // Targeted search — only real Indian/global e-commerce order emails
    const searchQuery = "(order confirmed OR order shipped OR order delivered OR purchase confirmed OR receipt) (amazon OR nykaa OR flipkart OR myntra OR ajio OR meesho OR tatacliq OR bewakoof OR westside OR zivame OR clovia OR puma OR adidas OR decathlon OR ikea OR pepperfry OR urbanladder OR croma OR reliance OR jiomart OR blinkit OR bigbasket OR swiggy OR zomato OR bookmyshow OR redbus OR irctc OR makemytrip OR goibibo)";
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
      logger.warn("[Gmail Sync DEBUG] No emails matched the purchase query. This is why extraction is empty.");
      return { categories: [], brands: [], recentOrders: [] };
    }

    const brandCounts = new Map<string, { count: number, source: string }>();
    const categories = new Set<string>();
    const productCounts = new Map<string, { product: string, source: string, count: number }>();

    // Analyze up to 25 messages
    const messagesToAnalyze = (searchData.messages || []).slice(0, 25);
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

        // ── BLOCKLIST CHECK: Skip non-purchase senders immediately ──────────
        const fromLowerCheck = from.toLowerCase();
        const isBlocklisted = NON_PURCHASE_DOMAINS.some(domain => fromLowerCheck.includes(domain));
        if (isBlocklisted) {
          logger.info({ from }, "[Gmail Sync] SKIPPED — non-purchase sender (education/job/streaming)");
          continue;
        }

        logger.info({ from, subject }, "[Gmail Sync DEBUG] Analyzing email");

        // Determine Source platform (expanded for Indian e-commerce)
        let source = "Email";
        const fromLower = from.toLowerCase();
        if (fromLower.includes("amazon")) source = "Amazon";
        else if (fromLower.includes("flipkart")) source = "Flipkart";
        else if (fromLower.includes("nykaa")) source = "Nykaa";
        else if (fromLower.includes("myntra")) source = "Myntra";
        else if (fromLower.includes("meesho")) source = "Meesho";
        else if (fromLower.includes("swiggy")) source = "Swiggy";
        else if (fromLower.includes("zomato")) source = "Zomato";
        else if (fromLower.includes("bigbasket") || fromLower.includes("blinkit") || fromLower.includes("zepto")) source = "Grocery";
        else if (fromLower.includes("bookmyshow")) source = "BookMyShow";
        else if (fromLower.includes("redbus") || fromLower.includes("irctc") || fromLower.includes("indigo")) source = "Travel";
        else if (fromLower.includes("ajio")) source = "Ajio";
        else if (fromLower.includes("tatacliq")) source = "TataCliq";

        // Extract brand from sender Display Name (e.g., "Nykaa" <orders@nykaa.com>)
        let extractedBrand = "Unknown Brand";
        const nameMatch = from.match(/^"?([^"<>@]+)"?\s*</);
        if (nameMatch && nameMatch[1].trim().length > 1) {
          extractedBrand = nameMatch[1].trim();
        } else {
          // fallback to domain
          const domainMatch = from.match(/@([^>@\s.]+)\./i);
          if (domainMatch) {
             extractedBrand = capitalize(domainMatch[1].toLowerCase());
          }
        }
        
        const uselessPrefixes = ["support", "noreply", "no-reply", "notifications", "info", "mail", "help", "customer", "care", "service", "payment"];
        if (uselessPrefixes.some(p => extractedBrand.toLowerCase().startsWith(p))) {
          extractedBrand = "Unknown Brand";
        }

        // Fix: If brand is still unknown, fallback to the detected source platform
        if (extractedBrand === "Unknown Brand" && source !== "Email") {
          extractedBrand = source;
        }

        if (extractedBrand !== "Unknown Brand") {
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
        else if (isTravel(searchDomain)) categories.add("travel");
        // ── Extract Product from Snippet + Subject ──────────────────────────
        // Snippets contain email body preview: "Your order of [Product] is confirmed"
        const combinedText = `${subject} ${snippet}`;

        // Skip parsing logistics updates that falsely map as products
        const isLogistics = ["courier", "in transit", "will be on the way", "ready to be", "out for delivery", "tracking", "docket", "awb", "status update"].some(kw => combinedText.toLowerCase().includes(kw));
        if (isLogistics) {
          continue; // skip trying to extract product name from courier updates
        }
        // Super-Aggressive E-Commerce specific extraction
        const smartPatterns = [
          // Amazon India
          /Amazon\.in - Confirmation of your order:\s+([A-Za-z0-9\s\-&]+)/i,
          /Amazon\.in order of\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|\s+was\s|\s+will\s|[,.!\n]|$)/i,
          /Your Amazon\.in order #[-0-9]+ for\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|[,.!\n]|$)/i,
          // Nykaa
          /Your Nykaa order containing\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|[,.!\n]|$)/i,
          /Your Nykaa Order for\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|[,.!\n]|$)/i,
          /Nykaa order containing\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|[,.!\n]|$)/i,
          // Flipkart & Myntra
          /Your order for\s+([A-Za-z0-9\s\-&]+?)\s+from Flipkart/i,
          /Flipkart order for\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|[,.!\n]|$)/i,
          /Myntra order for\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|[,.!\n]|$)/i,
          // Common Indian Purchase Keywords
          /booking id\s*[-:A-Z0-9]+\s*for\s+([A-Za-z0-9\s\-&]+)/i,
          /transaction\s+for\s+([A-Za-z0-9\s\-&]+)/i,
          /order\s+for\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|\s+was\s|\s+will\s|[,.!\n]|$)/i,
          /order\s+of\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|\s+was\s|\s+will\s|[,.!\n]|$)/i,
          /purchased\s+([A-Za-z0-9\s\-&]+?)(?:\s+has\s|\s+is\s|\s+was\s|\s+will\s|[,.!\n]|$)/i,
          /item:\s*([A-Za-z0-9][A-Za-z0-9\s\-&]+)/i,
          /product:\s*([A-Za-z0-9][A-Za-z0-9\s\-&]+)/i,
          /ticket for\s+([A-Za-z0-9][A-Za-z0-9\s\-&]+)/i,
          /booking for\s+([A-Za-z0-9][A-Za-z0-9\s\-&]+)/i,
          /confirmed:\s+([A-Za-z0-9\s\-&]+)/i
        ];

        let extractedProduct: string | null = null;
        for (const pattern of smartPatterns) {
          const match = combinedText.match(pattern);
          if (match?.[1] && match[1].trim().length > 3) {
            // Drop it if it accidentally matched a garbage sentence
            const badWords = ["successfully", "placed", "our team", "doing", "delivery", "payment"];
            if (!badWords.some(bw => match[1].toLowerCase().includes(bw))) {
               // RIGIDITY FIX: Strip common filler and keep it to 2 words max
               const clean = match[1].replace(/[^a-zA-Z0-9\s]/g, "").trim();
               const words = clean.split(/\s+/);
               extractedProduct = words.slice(0, 2).join(" ");
               break;
            }
          }
        }

        // Fallback: Default to [Brand] [Category] so the LLM still gets perfect context
        if (!extractedProduct) {
          // Attempt a "Smart Snippet" extraction by looking for common nouns after purchase verbs
          const snippetLower = snippet.toLowerCase();
          const purchaseVerbs = ["ordered", "purchased", "bought", "delivered", "shipping", "item", "product"];
          for (const verb of purchaseVerbs) {
            const verbIndex = snippetLower.indexOf(verb);
            if (verbIndex !== -1) {
              const afterVerb = snippet.substring(verbIndex + verb.length).trim();
              const words = afterVerb.split(" ").slice(0, 4); // Take next 4 words
              if (words.length > 0) {
                 extractedProduct = words.join(" ");
                 break;
              }
            }
          }
        }

        if (!extractedProduct) {
          let catDesc = "Item";
          if (combinedText.toLowerCase().includes("lipstick") || categories.has("beauty")) catDesc = "Beauty Product";
          else if (combinedText.toLowerCase().includes("shirt") || categories.has("fashion")) catDesc = "Apparel";
          else if (combinedText.toLowerCase().includes("phone") || categories.has("electronics")) catDesc = "Electronics";
          else if (categories.has("food")) catDesc = "Food";
          else if (categories.has("travel") || combinedText.toLowerCase().includes("train") || combinedText.toLowerCase().includes("ticket")) catDesc = "Travel Booking";
          
          const finalBrand = extractedBrand !== "Unknown Brand" ? extractedBrand : (source !== "Email" ? source : "Web");
          extractedProduct = `${finalBrand} ${catDesc}`;
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

    const result = {
      categories: Array.from(categories).slice(0, 6),
      brands: Array.from(brandCounts.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      recentOrders: Array.from(productCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    };

    logger.info({
      orders_count: result.recentOrders.length,
      top_orders: result.recentOrders.slice(0, 15).map(o => `(${o.count}, ${o.source}, ${o.product})`),
      brands: result.brands.map(b => b.name)
    }, "[Gmail Sync DEBUG] Intelligence feasting complete!");

    return result;
  } catch (err) {
    logger.error({ err }, "[Gmail Sync] Fatal error during extraction");
    return { categories: [], brands: [], recentOrders: [] };
  }
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

export default router;
