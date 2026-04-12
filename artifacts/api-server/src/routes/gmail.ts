import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { db, profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import type { User } from "@workspace/db";

type AuthRequest = Request & { user: User };

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function getRedirectUri(req: Request): string {
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost") as string;
  const proto = (req.headers["x-forwarded-proto"] || "https") as string;
  return `${proto}://${host}/api/gmail/callback`;
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
  const { code, state: userId, error } = req.query as { code?: string; state?: string; error?: string };

  if (error || !code || !userId) {
    res.redirect(`/?gmail_error=${encodeURIComponent(error || "Authorization failed")}`);
    return;
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.redirect("/?gmail_error=Gmail+integration+not+configured");
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

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
      res.redirect(`/?gmail_error=${encodeURIComponent("Failed to get access token: " + (tokenData.error || "unknown"))}`);
      return;
    }

    // Fetch Gmail messages to extract purchase signals
    const purchaseSignals = await extractPurchaseSignals(tokenData.access_token);

    // Update the user's profile with email integration data
    const [existingProfile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.userId, userId));

    if (existingProfile) {
      await db
        .update(profilesTable)
        .set({
          emailIntegration: {
            connected: true,
            categories: purchaseSignals.categories,
            brands: purchaseSignals.brands,
          } as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(profilesTable.userId, userId));
    }

    // Redirect back to onboarding/dashboard with success
    res.redirect(`/?gmail_success=1&brands=${purchaseSignals.brands.slice(0, 3).join(",")}&categories=${purchaseSignals.categories.slice(0, 3).join(",")}`);
  } catch (err) {
    res.redirect(`/?gmail_error=${encodeURIComponent("Gmail sync failed. Please try again.")}`);
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

async function extractPurchaseSignals(accessToken: string): Promise<{ categories: string[]; brands: string[] }> {
  try {
    // Search for purchase-related emails
    const searchResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:(order+OR+purchase+OR+receipt+OR+invoice+OR+shipped+OR+delivery+OR+confirmation)&maxResults=50",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchResponse.json() as { messages?: Array<{ id: string }> };

    if (!searchData.messages?.length) {
      return { categories: [], brands: [] };
    }

    const brands = new Set<string>();
    const categories = new Set<string>();

    // Analyze up to 20 messages
    const messagesToAnalyze = searchData.messages.slice(0, 20);
    for (const msg of messagesToAnalyze) {
      try {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgResponse.json() as { payload?: { headers?: Array<{ name: string; value: string }> } };

        const headers = msgData.payload?.headers ?? [];
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "";

        // Extract brand from sender domain
        const domainMatch = from.match(/@([^>@\s.]+)\./i);
        if (domainMatch) {
          const domain = domainMatch[1].toLowerCase();
          // Skip generic email providers
          if (!["gmail", "yahoo", "outlook", "hotmail", "icloud", "me", "mail", "amazon"].includes(domain)) {
            brands.add(capitalize(domain));
          }
          // Categorize based on known brands
          if (isElectronics(domain)) categories.add("electronics");
          else if (isFashion(domain)) categories.add("fashion");
          else if (isFood(domain)) categories.add("food");
          else if (isHome(domain)) categories.add("home");
          else if (isBeauty(domain)) categories.add("beauty");
          else if (isSports(domain)) categories.add("sports");
        }

        // Also extract from Amazon orders
        if (from.includes("amazon")) {
          brands.add("Amazon");
          const subjectLower = subject.toLowerCase();
          if (subjectLower.includes("book")) categories.add("books");
          else if (subjectLower.includes("kindle")) categories.add("electronics");
          else categories.add("general");
        }
      } catch {
        // Skip individual message errors
      }
    }

    return {
      categories: Array.from(categories).slice(0, 6),
      brands: Array.from(brands).slice(0, 10),
    };
  } catch {
    return { categories: [], brands: [] };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ELECTRONICS_BRANDS = ["apple", "samsung", "sony", "lg", "dell", "lenovo", "hp", "asus", "nvidia", "intel", "bestbuy", "newegg", "bhphotovideo", "microcenter", "bose", "jabra", "logitech", "anker"];
const FASHION_BRANDS = ["zara", "hm", "uniqlo", "asos", "nordstrom", "nike", "adidas", "puma", "gucci", "prada", "levi", "gap", "banana", "mango", "topshop", "forever21", "shein", "boohoo", "fashionova"];
const FOOD_BRANDS = ["doordash", "ubereats", "grubhub", "instacart", "postmates", "seamless", "opentable", "chipotle", "starbucks"];
const HOME_BRANDS = ["ikea", "wayfair", "homedepot", "lowes", "pottery", "crate", "west elm", "target", "walmart", "costco", "overstock"];
const BEAUTY_BRANDS = ["sephora", "ulta", "glossier", "nars", "fenty", "estee", "lancome", "maybelline", "loreal", "olay", "clinique", "mac"];
const SPORTS_BRANDS = ["rei", "patagonia", "northface", "columbia", "underarmour", "lululemon", "peloton", "dickssporting", "academy"];

function isElectronics(d: string) { return ELECTRONICS_BRANDS.some(b => d.includes(b)); }
function isFashion(d: string) { return FASHION_BRANDS.some(b => d.includes(b)); }
function isFood(d: string) { return FOOD_BRANDS.some(b => d.includes(b)); }
function isHome(d: string) { return HOME_BRANDS.some(b => d.includes(b)); }
function isBeauty(d: string) { return BEAUTY_BRANDS.some(b => d.includes(b)); }
function isSports(d: string) { return SPORTS_BRANDS.some(b => d.includes(b)); }

export default router;
