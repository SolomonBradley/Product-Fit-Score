import { isOllamaAvailable, generateJSON, OLLAMA_MODEL } from "./ollamaClient";
import { logger } from "./logger";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface MasterIntelligence {
  productName: string;
  category: string;
  brand: string;
  price?: number | null;
  currency?: string;
  strengths: string[];
  weaknesses: string[];
  riskFactors: string[];
  featureScores: {
    camera: number | null; battery: number | null; performance: number | null; value: number | null; design: number | null; durability: number | null;
  };
  fitScore: number;
  riskLevel: "Low" | "Medium" | "High";
  whyItFitsYou: string[];
  whyItMayNot: string[];
  intelligenceSource: "LLM" | "Procedural";
}

export interface UserContext {
  interests: string[];
  emailCategories: string[];
  emailBrands: Array<{ name: string; count: number; source: string }>;
  gender: string;
  recentOrders: Array<{ product: string; source: string; count: number }>;
}

// All known product category keywords — used to detect cross-category interest bleed
const ALL_KNOWN_CATEGORIES = [
  "apparel", "clothing", "fashion", "footwear", "shoes",
  "electronics", "smartphone", "laptop", "audio", "camera", "gaming",
  "beauty", "skincare", "cosmetics", "makeup",
  "home", "kitchen", "decor", "furniture",
  "bag", "luggage", "handbag",
  "sports", "fitness", "outdoor",
  "food", "grocery", "travel",
];

function getFilteredContext(user: UserContext, productCategory: string) {
  const cat = productCategory.toLowerCase();

  const filteredInterests = user.interests.filter(i => {
    const iLower = i.toLowerCase();

    // Case 1: Interest has "for <Category>" suffix — only keep if it matches this product's category
    const forMatch = i.match(/for ([^,.]+)$/i);
    if (forMatch) {
      const targetCat = forMatch[1].trim().toLowerCase();
      return cat.includes(targetCat) || targetCat.includes(cat.split(" ")[0]);
    }

    // Case 2: Interest contains ANY other known category keyword not related to this product
    // e.g. "values quality apparel" should NOT appear in a Bag analysis
    const containsOtherCategory = ALL_KNOWN_CATEGORIES.some(kw => {
      if (cat.includes(kw)) return false; // it's THIS category, keep it
      return iLower.includes(kw);
    });
    if (containsOtherCategory) return false;

    return true; // genuinely general interest, keep it
  });

  // Build the list of excluded category names so we can FORBID them in the prompt
  const excludedCategories = Array.from(new Set(
    user.interests
      .filter(i => !filteredInterests.includes(i))
      .flatMap(i => {
        const fm = i.match(/for ([^,.]+)$/i);
        if (fm) return [fm[1].trim()];
        // Extract whichever known category word triggered the exclusion
        const iL = i.toLowerCase();
        return ALL_KNOWN_CATEGORIES.filter(kw => !cat.includes(kw) && iL.includes(kw));
      })
  ));

  const relevantOrders = user.recentOrders?.filter(o => {
    const p = o.product.toLowerCase();
    if ((cat.includes("bag") || cat.includes("luggage")) && (p.includes("bag") || p.includes("luggage") || p.includes("handbag") || p.includes("wallet"))) return true;
    if (cat.includes("apparel") && (p.includes("shirt") || p.includes("dress") || p.includes("wear") || p.includes("kurta") || p.includes("jeans"))) return true;
    if (cat.includes("electronic") && (p.includes("phone") || p.includes("laptop") || p.includes("earphone") || p.includes("watch"))) return true;
    if (cat.includes("beauty") && (p.includes("lipstick") || p.includes("cream") || p.includes("face") || p.includes("serum") || p.includes("moisturizer"))) return true;
    if (cat.includes("footwear") || cat.includes("shoe")) {
      if (p.includes("shoe") || p.includes("sneaker") || p.includes("sandal") || p.includes("slipper")) return true;
    }
    return cat === "general" || cat === "unknown category";
  }) || [];

  return { filteredInterests, excludedCategories, relevantOrders };
}

// ─── Scraper & Pruning ───────────────────────────────────────────────────────

function cleanPageContent(html: string): string {
  // Capture Breadcrumbs for hard classification
  const breadcrumbMatch = html.match(/<div[^>]*id="wayfinding-breadcrumbs_container"[^>]*>([\s\S]*?)<\/div>/i);
  const breadcrumbs = breadcrumbMatch ? breadcrumbMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").split(/\s*[›>]\s*/).map(s => s.trim()).filter(Boolean).pop() || "General" : "Unknown Category";

  const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/i) || 
                     html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Unknown Product";

  const priceMatch = html.match(/<span[^>]*class="a-price-whole"[^>]*>([\s\S]*?)<\/span>/i);
  const price = priceMatch ? priceMatch[1].trim() : "Unknown Price";

  // Semantic extraction of features and reviews
  let body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const mainText = body.slice(0, 4000); // Take first 4k chars for speed+relevance

  const reviewMarker = "--- CUSTOMER REVIEW ---";
  let reviews = "";
  if (html.includes(reviewMarker)) {
      reviews = html.split(reviewMarker).slice(1, 4).map(r => r.substring(0, 300).trim()).join("\n---\n");
  }

  return `CATEGORY: ${breadcrumbs}\nTITLE: ${title}\nPRICE: ${price}\nDETAILS: ${mainText}\nREVIEWS:\n${reviews}`;
}

async function fetchProductPage(url: string): Promise<string> {
  let browser;
  try {
    logger.info({ url }, "[Scraper] Launching Stealth Scraper...");
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const reviewData = (await page.evaluate(`(() => {
        const els = Array.from(document.querySelectorAll('.review-text-content, .a-expander-content.reviewText, .vdWf9X'));
        return els.map(e => "--- CUSTOMER REVIEW ---\\n" + e.textContent.trim()).join("\\n");
    })()`).catch(() => "")) as string;
    
    const html = await page.content();
    return reviewData ? (reviewData + "\n" + html) : html;
  } catch (err) {
    logger.warn({ err }, "[Scraper] Puppeteer failed, falling back to fetch");
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return res.text();
  } finally {
    if (browser) await browser.close();
  }
}

// ─── The Intelligence Engine ──────────────────────────────────────────────────

async function analyzeProduct(html: string, url: string, user: UserContext): Promise<MasterIntelligence | null> {
  const cleaned = cleanPageContent(html);
  
  // ─── Category Isolation Phase ─────────────────────────────────────────────
  const productCategory = cleaned.match(/CATEGORY: (.*)/)?.[1] || "General";
  const { filteredInterests, excludedCategories, relevantOrders } = getFilteredContext(user, productCategory);

  // ⚠️ HIGH RISK FIX #10: Strict category enum enforced in LLM prompt
  // This may cause analysis to fail if product doesn't fit predefined categories.
  // Monitor error rates and fallback behavior.

  // Format orders as (Count, Product, Website) list for the LLM
  const orderList = relevantOrders.map(o => `(${o.count}x, ${o.product}, ${o.source})`).join(", ") || "No relevant historical orders for this category";

  // ── BRAND FILTER: Only pass real retail/shopping brands to the LLM ──────────
  // Excludes education, jobs, streaming, banking — only physical product stores matter.
  const NON_RETAIL_KEYWORDS = [
    "udemy","coursera","edx","skillshare","linkedin","udacity","pluralsight",
    "simplilearn","greatlearning","upgrad","scaler","codecademy","datacamp",
    "accenture","infosys","wipro","tcs","capgemini","cognizant","hcl",
    "naukri","indeed","glassdoor","spotify","netflix","primevideo","hotstar",
    "disney","hdfcbank","icicibank","sbicard","axisbank","phonepe","paytm",
    "googlepay","razorpay","google","microsoft","varsha","unknown",
  ];
  const shoppingBrands = user.emailBrands?.filter(b => {
    const lower = b.name.toLowerCase();
    return !NON_RETAIL_KEYWORDS.some(kw => lower.includes(kw));
  }) || [];

  const brandList = shoppingBrands.length > 0
    ? shoppingBrands.map(b => `${b.name} (${b.count} orders via ${b.source})`).join(", ")
    : "No specific retail brand loyalty detected";

  const prompt = `Role: High-Intelligence Skeptical Shopping Assistant (Strict Mode).
Task: Determine if the product below is a genuine fit for this specific user or just a forced marketing match.

[USER PROFILE (RELEVANT TO ${productCategory.toUpperCase()} ONLY)]
- Key Interests: ${filteredInterests.join(", ")}
- Documented Habits in this category (Count, Item, Store): ${orderList}
- Preferred Brands & Loyalty: ${brandList}
- Gender Profile: ${user.gender}

[PRODUCT DATA] 
${cleaned}

${excludedCategories.length > 0 ? `[ZERO-TOLERANCE FORBIDDEN RULE]
⛔ The user has preferences for OTHER product categories (${excludedCategories.join(", ")}). These are stored in SEPARATE buckets and are 100% IRRELEVANT to this analysis.
This analysis is ONLY about: ${productCategory}. Do NOT reference, compare, or mention user habits from any other category.` : `[SCOPE]
This analysis is ONLY about: ${productCategory}.`}

[REASONING PROTOCOLS]
1. SKEPTICAL ANALYSIS: Be a critic. Identify "marketing fluff" in the product description. If a bag claims "high durability" but is made of cotton, call it out.
2. AUTHENTIC FIT: Do NOT use generic phrases like "stylish and spacious". Speak specifically about THIS product's actual features vs the user's documented habits.
3. NO DEFAULT SCORES: Calculate Feature Scores from 0-10 based on raw evidence from the product page. Do NOT default to 7.
4. NEVER EXPLICIT: NEVER use phrases like "your prioritization of" or "your documented habit of prioritizing". Speak naturally without referencing the user's meta-data.
5. NO CONTRADICTION: Ensure "whyItFitsYou" and "whyItMayNot" do NOT contradict each other. Take a clear stance.
6. HABITS VS INTERESTS: Documented Habits are 10x more important than Interests. Use habits to verify if they actually buy what they say they like.
7. EVIDENCE-BASED MATCHING: Only match a User Interest if the product context directly supports it with specific evidence from the product page.
8. DYNAMIC FEATURE EXTRACTION: In your JSON response, provide a "featureScores" object with 4-5 category-specific features (e.g., for a Bag: "Capacity", "Material", "Compartments", "Style").
9. BULLET POINT FORMATTING: "whyItFitsYou" and "whyItMayNot" MUST be arrays of 2-3 concise, conversational bullet points.
10. SIMPLE LANGUAGE: No jargon. Write like a smart friend giving honest advice, not a marketing bot.

Return JSON ONLY:
{
  "productName": "",
  "category": "Smartphones|Laptops|Electronics|Apparel|Footwear|Bags|Audio|Cameras|Gaming|Skincare|Home|Kitchen",
  "brand": "",
  "strengths": ["Evidence-based strength"],
  "weaknesses": ["Evidence-based weakness"],
  "featureScores": { 
    "value": 0-10, 
    "design": 0-10, 
    "durability": 0-10,
    "[Specific simple feature 1, e.g. comfort, space, battery, ingredients]": 0-10,
    "[Specific simple feature 2, e.g. fit, performance, weight, texture]": 0-10
  },
  "fitScore": 0-100 (calculate mathematically),
  "whyItFitsYou": ["Complex analysis of how it matches their HABITS, not just interests"],
  "whyItMayNot": ["Skeptical observation about potential mismatch with their buying patterns"]
}`;

  logger.info({ model: OLLAMA_MODEL }, "[Engine] Initiating LLM Analysis Mode (Strict Skeptical Logic)...");
  return await generateJSON<MasterIntelligence>(prompt);
}

export async function recalculateFitScoreForUser(
  base: MasterIntelligence, 
  user: UserContext, 
  boost: string, 
  prev: { fitScore: number, whyItFitsYou: string[], whyItMayNot: string[] }
): Promise<Partial<MasterIntelligence> | null> {
  const { filteredInterests } = getFilteredContext(user, base.category);
  const prompt = `Task: Update the fit analysis by prioritizing: "${boost}".
Current Profile: ${filteredInterests.join(", ")}
Previous Verdict: ${prev.fitScore} Fit Score.
Previous Feature Scores: ${JSON.stringify(base.featureScores)}
Product Context: [${base.productName} in ${base.category}].

RULES:
1. WEIGHTAGE: The updated Fit Score must be a split of 60% weight on the "${boost}" performance and 40% weight on the previous comprehensive analysis.
2. If the user wants to prioritize "Value" and reviews say it's expensive, the score MUST go down significantly (due to the 60% weight).
3. If they prioritize "Value" and it's cheap/good deals, the score MUST go up.
4. Keep the reasoning conversational and skeptical.
5. NEVER explicitly mention the user's priority (e.g. don't say "Because you prioritize design..."). Be natural.
6. CATEGORY ISOLATION: Ignore interests from completely unrelated categories.
7. ALL features from the previous analysis must be returned in "featureScores", adjusted based on the new ${boost} priority.

Return JSON ONLY:
{
  "fitScore": 0-100 (weighted 60/40 between boosted feature and previous score),
  "featureScores": { /* return ALL previous keys with their new scores */ },
  "whyItFitsYou": ["New updated reason"],
  "whyItMayNot": ["New skeptical observation"]
}`;

  return await generateJSON<Partial<MasterIntelligence>>(prompt);
}

// ─── Small Brain (Procedural Fallback) ───────────────────────────────────────

function getProceduralAnalysis(cleaned: string, user: UserContext): MasterIntelligence {
  const title = cleaned.match(/TITLE: (.*)/)?.[1]?.toLowerCase() || "";
  const category = cleaned.match(/CATEGORY: (.*)/)?.[1]?.toLowerCase() || "general";
  const { filteredInterests, relevantOrders } = getFilteredContext(user, category);
  
  let fitScore = 60; // Neutral baseline
  let whyItFitsYou = ["Evaluated based on utility and general profile."];

  // Weighted Keyword Scoring
  const scores = {
    brandMatch: user.emailBrands.some(b => title.includes(b.name.toLowerCase())) ? 20 : 0,
    productMatch: relevantOrders.some(o => title.includes(o.product.toLowerCase())) ? 25 : 0,
    interestMatch: filteredInterests.some(i => title.includes(i.toLowerCase())) ? 15 : 0
  };

  fitScore += (scores.brandMatch + scores.productMatch + scores.interestMatch);
  fitScore = Math.min(fitScore, 95);

  if (scores.brandMatch && scores.productMatch) {
    whyItFitsYou = ["Direct Match: You frequently buy this brand and product type."];
  } else if (scores.productMatch) {
    whyItFitsYou = ["System Match: You have a documented history of buying this type of product."];
  }

  return {
    productName: title || "Product",
    category,
    brand: "Detected",
    strengths: ["Historical relevance check"],
    weaknesses: ["Algorithmic fallback active"],
    riskFactors: [],
    riskLevel: "Medium",
    featureScores: { value: 6, design: 6, durability: 6, camera: null, battery: null, performance: null },
    fitScore,
    whyItFitsYou,
    whyItMayNot: ["Detailed reasoning offline."],
    intelligenceSource: "Procedural"
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function analyzeProductForUser(url: string, user: UserContext) {
  const ollamaReady = await isOllamaAvailable();
  const html = await fetchProductPage(url);
  const cleaned = cleanPageContent(html);
  
  let result = await analyzeProduct(html, url, user);

  if (!result) {
    logger.warn("[Engine] Switching to Small Brain Procedural Fallback.");
    result = getProceduralAnalysis(cleaned, user);
  } else {
    result.intelligenceSource = "LLM";
  }

  // ENFORCING BUCKET LIMIT: Max 2 boosts per category (case-insensitive category match).
  const resultCategoryLower = (result?.category ?? "").toLowerCase().trim();
  const prioritizedFeatures = user.interests
    .filter(i => {
      if (!i.startsWith("Prioritizes ")) return false;
      const forMatch = i.match(/for (.+)$/i);
      if (!forMatch) return false;
      return forMatch[1].trim().toLowerCase() === resultCategoryLower;
    })
    .map(i => {
      // Extract feature name: "Prioritizes Water Resistance for Bags & Luggage" → "Water Resistance"
      const match = i.match(/^Prioritizes (.+?) for /i);
      return match ? match[1].trim() : "";
    })
    .filter(Boolean);

  let boostableFeatures: string[] = [];
  if (prioritizedFeatures.length < 2) {
    const allFeatures = Object.entries(result.featureScores || {})
      .filter(([_, score]) => score !== null && score !== undefined)
      .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1));
    // Only show features not already boosted for THIS category
    boostableFeatures = allFeatures.filter(f => !prioritizedFeatures.map(p => p.toLowerCase()).includes(f.toLowerCase()));
  }
  // If already at 2 boosts for this category, boostableFeatures stays empty — no more boosts allowed

  return {
    ...result,
    productUrl: url,
    boostableFeatures,
    analyzedAt: new Date().toISOString(),
    llmPowered: ollamaReady
  };
}
