import { isOllamaAvailable, generateJSON, OLLAMA_MODEL } from "./ollamaClient";
import { logger } from "./logger";
import { ProductCategory, CATEGORY_FEATURES, APPAREL_CATEGORIES, detectCategory, getUmbrellaCategory } from "./categories";
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
  featureScores: Record<string, number | null>; // DYNAMIC: Based on product category
  fitScore: number;
  riskLevel: "Low" | "Medium" | "High";
  whyItFitsYou: string[];
  whyItMayNot: string[];
  intelligenceSource: "LLM" | "Procedural";
}

export interface UserContext {
  interests: string[];
  emailCategories: string[];
  emailBrands: Array<[string, number, string] | { name: string; count: number; source: string }>; // Support both tuple and object formats
  gender: string;
  recentOrders: Array<[number, string, string] | { product: string; source: string; count: number }>; // Support both tuple and object formats
  
  // ✅ AR & Body Measurements for smart apparel fitting
  arMeasurements?: {
    chest: number | null;      // inches
    waist: number | null;      // inches
    hips: number | null;       // inches
    inseam: number | null;     // inches
  };
  height?: number;            // cm
  weight?: number;            // kg
  apparelPreferences?: {
    topSize: string;          // XS, S, M, L, XL, XXL
    bottomSize: string;       // 28, 30, 32, 34, etc.
  };
}

// Helper functions to normalize tuple/object formats
function normalizeBrand(b: [string, number, string] | { name: string; count: number; source: string }) {
  if (Array.isArray(b)) return { name: b[0] ?? "Unknown", count: b[1] ?? 1, source: b[2] ?? "Direct" };
  const obj = b as { name: string; count: number; source: string };
  return { name: obj.name ?? "Unknown", count: obj.count ?? 1, source: obj.source ?? "Direct" };
}

function normalizeOrder(o: [number, string, string] | { product: string; source: string; count: number }) {
  if (Array.isArray(o)) return { count: o[0] ?? 1, product: o[1] ?? "Item", source: o[2] ?? "Direct" };
  const obj = o as { product: string; source: string; count: number };
  return { count: obj.count ?? 1, product: obj.product ?? "Item", source: obj.source ?? "Direct" };
}

function getFilteredContext(user: UserContext, productCategory: ProductCategory | string) {
  // Convert ProductCategory enum to string for comparison
  const cat = (productCategory as string).toLowerCase();

  // We no longer hardcode interest exclusion. Let the AI reason about what is relevant.
  const filteredInterests = user.interests;
  const excludedCategories: string[] = [];

  // Filter relevant orders based on strict category matching
  const relevantOrders = user.recentOrders?.filter(o => {
    const normalized = normalizeOrder(o);
    const p = normalized.product.toLowerCase();
    
    // Match based on ProductCategory enum value
    if (cat.includes("bag") && (p.includes("bag") || p.includes("luggage") || p.includes("handbag") || p.includes("wallet"))) return true;
    if (cat.includes("apparel") && (p.includes("shirt") || p.includes("dress") || p.includes("wear") || p.includes("kurta") || p.includes("jeans") || p.includes("top"))) return true;
    if ((cat.includes("smartphone") || cat.includes("laptop") || cat.includes("tablet") || cat.includes("audio") || cat.includes("camera")) && (p.includes("phone") || p.includes("laptop") || p.includes("tablet") || p.includes("earphone") || p.includes("watch") || p.includes("camera"))) return true;
    if ((cat.includes("skincare") || cat.includes("makeup") || cat.includes("haircare")) && (p.includes("lipstick") || p.includes("cream") || p.includes("face") || p.includes("serum") || p.includes("moisturizer") || p.includes("shampoo") || p.includes("mask"))) return true;
    if ((cat.includes("footwear") || cat.includes("shoe")) && (p.includes("shoe") || p.includes("sneaker") || p.includes("sandal") || p.includes("slipper") || p.includes("boot"))) return true;
    
    return false; // Don't return everything as fallback
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
    try {
      const res = await fetch(url, { 
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const html = await res.text();
      
      // Extract basic info from HTML fallback
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].trim().substring(0, 200) : "Product from " + url;
      
      // Extract any text content for context
      const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 5000);
      
      return `TITLE: ${title}\nURL: ${url}\nPAGE_CONTENT: ${textContent}`;
    } catch (fetchErr) {
      logger.error({ fetchErr }, "[Scraper] Fetch also failed");
      // Return minimal info so LLM can still analyze
      return `URL: ${url}\nNote: Unable to fetch page details, using URL context for analysis`;
    }
  } finally {
    if (browser) await browser.close();
  }
}

// ─── The Intelligence Engine ──────────────────────────────────────────────────

async function analyzeProduct(html: string, url: string, user: UserContext): Promise<MasterIntelligence | null> {
  const cleaned = cleanPageContent(html);
  
  // ─── Category Isolation Phase ─────────────────────────────────────────────
  const rawProductCategory = cleaned.match(/CATEGORY: (.*)/)?.[1] || "General";
  
  // Attempt to map to strict category enum
  const detectedCategory = detectCategory(rawProductCategory, cleaned.match(/TITLE: (.*)/)?.[1]);
  const categoryFeatures = CATEGORY_FEATURES[detectedCategory];
  const umbrellaCategory = getUmbrellaCategory(detectedCategory);
  
  const { filteredInterests, excludedCategories, relevantOrders } = getFilteredContext(user, detectedCategory);

  // Format orders as (Count, Product, Website) list for the LLM
  const orderList = relevantOrders.map(o => {
    const normalized = normalizeOrder(o);
    return `(${normalized.count}x, ${normalized.product}, ${normalized.source})`;
  }).join(", ") || "No relevant historical orders for this category";

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
    const normalized = normalizeBrand(b);
    const lower = normalized.name.toLowerCase();
    return !NON_RETAIL_KEYWORDS.some(kw => lower.includes(kw));
  }) || [];

  const brandList = shoppingBrands.length > 0
    ? shoppingBrands.map(b => {
      const normalized = normalizeBrand(b);
      return `${normalized.name} (${normalized.count} orders via ${normalized.source})`;
    }).join(", ")
    : "No specific retail brand loyalty detected";

  // ── APPAREL CONTEXT: Smart size matching with AR measurements ────────────
  let apparelContext = "";
  if (APPAREL_CATEGORIES.has(detectedCategory)) {
    if (user.arMeasurements?.chest && user.arMeasurements?.waist) {
      // ✅ PRIMARY: Use actual AR measurements for intelligent fit analysis
      apparelContext = `

[USER BODY MEASUREMENTS (from AR camera scan - HIGHEST PRIORITY)]
- Chest: ${user.arMeasurements.chest}" (actual measurement)
- Waist: ${user.arMeasurements.waist}" (actual measurement)
- Hips: ${user.arMeasurements.hips ?? 'not measured'}"
- Inseam: ${user.arMeasurements.inseam ?? 'not measured'}"
- Height: ${user.height ? user.height + ' cm' : 'not provided'}
- Gender: ${user.gender || 'not specified'}

[USER APPAREL PREFERENCES]
- Typical Top Size: ${user.apparelPreferences?.topSize ?? 'not specified'}
- Typical Bottom Size: ${user.apparelPreferences?.bottomSize ?? 'not specified'}

⚠️ CRITICAL SIZE MATCHING PROTOCOL:
1. Extract product's sizing information (e.g., "Size M: Chest 38-40 inches")
2. Cross-reference against user's ACTUAL measurements from AR scan
3. If product has multiple sizes, recommend the BEST match based on measurements
4. Check reviews for "runs large/small/true to size" patterns
5. Provide SPECIFIC size recommendation (e.g., "Order XS, not S" or "Go up one size")
6. If measurements don't align clearly, flag as "Medium" risk in riskLevel`;
    } else if (user.apparelPreferences?.topSize) {
      // ✅ SECONDARY: Use apparel size preferences (less precise)
      apparelContext = `

[USER APPAREL PREFERENCES]
- Typical Top Size: ${user.apparelPreferences.topSize}
- Typical Bottom Size: ${user.apparelPreferences.bottomSize}

Note: User prefers ${user.apparelPreferences.topSize} size. Without AR measurements, 
using historical size preference. Recommend AR measurement for more precise fit analysis.`;
    } else if (user.recentOrders && user.recentOrders.length > 0) {
      // ✅ FALLBACK: Infer from purchase history
      const apparelOrders = user.recentOrders.filter(o => {
        const normalized = normalizeOrder(o);
        return normalized.product.toLowerCase().includes("shirt") || 
               normalized.product.toLowerCase().includes("dress") || 
               normalized.product.toLowerCase().includes("pants") ||
               normalized.product.toLowerCase().includes("apparel");
      });
      if (apparelOrders.length > 0) {
        apparelContext = `

[USER APPAREL HISTORY]
- Recent purchases: ${apparelOrders.slice(0, 3).map((o: any) => {
          const normalized = normalizeOrder(o);
          return `${normalized.product} (${normalized.count}x)`;
        }).join(", ")}

Note: Inferring size preferences from purchase history. For better accuracy, 
user should enable AR measurements for precise body dimension matching.`;
      }
    }
  }

  // ── SIZE DATA ISOLATION: Only include size for apparel categories ──────────
  let sizeContext = apparelContext;

  // Build feature score template (DYNAMIC based on category)
  const featureScoreTemplate = categoryFeatures
    .map((feature, idx) => `"${feature}": 0-10${idx < categoryFeatures.length - 1 ? ',' : ''}`)
    .join('\n    ');

  const prompt = `Role: High-Intelligence Skeptical Shopping Assistant (Strict Mode).
Task: Determine if the product below is a genuine fit for this specific user or just a forced marketing match.

[PRODUCT CATEGORY]
Strict Category: ${detectedCategory}
Umbrella Category: ${umbrellaCategory}
Category-Specific Features to Evaluate: ${categoryFeatures.join(", ")}

[USER PROFILE (RELEVANT TO ${detectedCategory.toUpperCase()} ONLY)]
- Key Interests: ${filteredInterests.length > 0 ? filteredInterests.join(", ") : "No specific interests in this category"}
- Documented Habits in this category (Count, Item, Store): ${orderList}
- Preferred Brands & Loyalty: ${brandList}
- Gender Profile: ${user.gender}${sizeContext}

[PRODUCT DATA] 
${cleaned}

${excludedCategories.length > 0 ? `[ZERO-TOLERANCE FORBIDDEN RULE]
⛔ The user has preferences for OTHER product categories (${excludedCategories.join(", ")}). These are stored in SEPARATE buckets and are 100% IRRELEVANT to this analysis.
This analysis is ONLY about: ${detectedCategory}. Do NOT reference, compare, or mention user habits from any other category.` : `[SCOPE]
This analysis is ONLY about: ${detectedCategory}.`}

[REASONING PROTOCOLS]
1. SKEPTICAL ANALYSIS: Be a critic. Identify "marketing fluff" in the product description. If a bag claims "high durability" but is made of cotton, call it out.
2. AUTHENTIC FIT: Do NOT use generic phrases like "stylish and spacious". Speak specifically about THIS product's actual features vs the user's documented habits.
3. NO DEFAULT SCORES: Calculate Feature Scores from 0-10 based on raw evidence from the product page. Do NOT default to 7.
4. NEVER EXPLICIT: NEVER use phrases like "your prioritization of" or "your documented habit of prioritizing". Speak naturally without referencing the user's meta-data.
5. NO CONTRADICTION: Ensure "whyItFitsYou" and "whyItMayNot" do NOT contradict each other. Take a clear stance.
6. HABITS VS INTERESTS: Documented Habits are 10x more important than Interests. Use habits to verify if they actually buy what they say they like.
7. LOGICAL ISOLATION: Look at the User's Interests array. If an interest has absolutely no logical relationship to the intrinsic utility of THIS product (e.g., associating 'Photography' to an Office Handbag strictly because it holds items), you MUST wholly ignore it. Do NOT force a fit! Only discuss interests that are undeniably relevant to this item's true nature.
8. DYNAMIC FEATURES: Return featureScores with exactly these keys (and NO others): ${categoryFeatures.map(f => `"${f}"`).join(", ")}
9. BULLET POINT FORMATTING: "whyItFitsYou" and "whyItMayNot" MUST be arrays of 2-3 concise, conversational bullet points. Ensure you explicitly cite raw text evidence bridging the item to the specific relevance criteria.
10. SIMPLE LANGUAGE: No jargon. Write like a smart friend giving honest advice, not a marketing bot.
${APPAREL_CATEGORIES.has(detectedCategory) ? `
11. ⭐ SMART SIZE MATCHING (CRITICAL FOR APPAREL):
    - Extract product sizing chart from description (e.g., "Size M: Chest 38-40 inches")
    - Cross-reference against user's body measurements from AR scan
    - Identify if product brand runs large/small/true-to-size from reviews
    - CRUCIAL COMPENSATION LOGIC:
      * If brand "runs large/huge" → Order SMALLER size to compensate
      * If brand "runs small/tight" → Order LARGER size to compensate
      * If brand "runs true to size" → Order your measured size
    - Provide SPECIFIC size recommendation: "Order XS, not S" (not generic)
    - If measurements conflict, raise riskLevel to "Medium"
    - Example: User chest 34" + product XS=32-34" + reviews "true to size" = Perfect fit, order XS
    - Example: User chest 34" + product S=36-38" + reviews "runs small" = Order S (runs small compensates for larger chart)
` : ``}

Return JSON ONLY:
{
  "productName": "",
  "category": "${detectedCategory}",
  "brand": "",
  "price": null,
  "currency": null,
  "strengths": ["Evidence-based strength"],
  "weaknesses": ["Evidence-based weakness"],
  "riskFactors": ["Potential risk or concern"],
  "featureScores": {
    ${featureScoreTemplate}
  },
  "fitScore": 0-100,
  "riskLevel": "Low|Medium|High",
  "whyItFitsYou": ["Complex analysis of how it matches their HABITS"],
  "whyItMayNot": ["Skeptical observation about potential mismatch"],
  "intelligenceSource": "LLM"
}`;

  logger.info({ model: OLLAMA_MODEL, category: detectedCategory }, "[Engine] Initiating LLM Analysis (Strict Skeptical Logic with Dynamic Features)...");
  return await generateJSON<MasterIntelligence>(prompt);
}

export async function recalculateFitScoreForUser(
  base: MasterIntelligence, 
  user: UserContext, 
  boost: string, 
  prev: { fitScore: number, whyItFitsYou: string[], whyItMayNot: string[] }
): Promise<Partial<MasterIntelligence> | null> {
  const { filteredInterests } = getFilteredContext(user, base.category);
  
  // Build the expected featureScores keys from base analysis
  const previousKeys = Object.keys(base.featureScores || {});
  const featuresList = previousKeys.join(", ");
  
  // ISSUE #8 FIX: Validate 60/40 weighting in LLM prompt with clear instructions
  const prompt = `Task: Recalculate the fit analysis by giving 60% weight to the user's prioritized attribute: "${boost}".

[CURRENT ANALYSIS]
Product: ${base.productName} (${base.category})
Previous Fit Score: ${prev.fitScore}/100
Previous Feature Scores: ${JSON.stringify(base.featureScores, null, 2)}
User Interests (Relevant): ${filteredInterests.length > 0 ? filteredInterests.join(", ") : "None"}

[WEIGHTING RULES - CRITICAL]
1. MATHEMATICAL WEIGHTING: 
   - New Fit Score = (Score_on_"${boost}" × 0.6) + (Previous Fit Score × 0.4)
   - This means: ${boost} importance = 60%, Overall analysis importance = 40%
   - Example: If ${boost} scores 85/100 and previous was 70/100, new score = (85×0.6) + (70×0.4) = 51 + 28 = 79/100
   
2. SIGNAL AMPLIFICATION: 
   - If ${boost} is strong (>75/100), the new score should be significantly higher than previous
   - If ${boost} is weak (<40/100), the new score should drop substantially
   - NO AVERAGING - strict 60/40 split must be applied

3. FEATURE SCORES: 
   - Keep ALL previous feature dimensions: ${featuresList}
   - Re-evaluate each dimension with ${boost} as the lens
   - Adjust only ${boost} heavily (±2-5 points typical), others adjust moderately (±1-2 points)

4. REASONING: Keep conversational and skeptical. Never say "you prioritize..."

Return JSON ONLY - EXACT STRUCTURE:
{
  "fitScore": <number between 0-100 using strict 60/40 formula>,
  "featureScores": {
    ${previousKeys.map(k => `"${k}": <updated number 0-10>`).join(",\n    ")}
  },
  "whyItFitsYou": ["Updated reason focusing on ${boost}", "Second supporting point"],
  "whyItMayNot": ["Skeptical concern even with ${boost} considered"],
  "intelligenceSource": "LLM"
}`;

  const result = await generateJSON<Partial<MasterIntelligence>>(prompt);
  
  // VALIDATION: Ensure featureScores is complete
  if (result && result.featureScores) {
    // Merge with previous to ensure no keys are dropped
    result.featureScores = { ...base.featureScores, ...result.featureScores };
  }
  
  return result;
}

// ─── Small Brain (Procedural Fallback) ───────────────────────────────────────

function getProceduralAnalysis(cleaned: string, user: UserContext): MasterIntelligence {
  const title = cleaned.match(/TITLE: (.*)/)?.[1]?.toLowerCase() || "";
  const categoryRaw = cleaned.match(/CATEGORY: (.*)/)?.[1]?.toLowerCase() || "general";
  const detectedCategory = detectCategory(categoryRaw, title);
  const categoryFeatures = CATEGORY_FEATURES[detectedCategory];
  
  const { filteredInterests, relevantOrders } = getFilteredContext(user, detectedCategory);
  
  let fitScore = 60; // Neutral baseline
  let whyItFitsYou = ["Evaluated based on utility and general profile."];

  // Weighted Keyword Scoring
  const scores = {
    brandMatch: user.emailBrands.some(b => {
      const normalized = normalizeBrand(b);
      return title.includes(normalized.name.toLowerCase());
    }) ? 20 : 0,
    productMatch: relevantOrders.some(o => {
      const normalized = normalizeOrder(o);
      return title.includes(normalized.product.toLowerCase());
    }) ? 25 : 0,
    interestMatch: filteredInterests.some(i => title.includes(i.toLowerCase())) ? 15 : 0
  };

  fitScore += (scores.brandMatch + scores.productMatch + scores.interestMatch);
  fitScore = Math.min(fitScore, 95);

  if (scores.brandMatch && scores.productMatch) {
    whyItFitsYou = ["Direct Match: You frequently buy this brand and product type."];
  } else if (scores.productMatch) {
    whyItFitsYou = ["System Match: You have a documented history of buying this type of product."];
  }

  // DYNAMIC featureScores based on category
  const featureScores: Record<string, number | null> = {};
  categoryFeatures.forEach(feature => {
    featureScores[feature] = 6; // Neutral procedural score
  });

  return {
    productName: title || "Product",
    category: detectedCategory,
    brand: "Detected",
    strengths: ["Historical relevance check"],
    weaknesses: ["Algorithmic fallback active"],
    riskFactors: [],
    riskLevel: "Medium",
    featureScores,
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
