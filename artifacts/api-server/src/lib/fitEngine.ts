export interface ProductIntelligence {
  productName: string;
  category: string;
  brand: string;
  price?: number | null;
  currency?: string;
  strengths: string[];
  weaknesses: string[];
  featureScores: {
    camera: number | null;
    battery: number | null;
    performance: number | null;
    value: number | null;
    design: number | null;
    durability: number | null;
  };
  riskFactors: string[];
  keywords: string[];
}

interface UserContext {
  interests: string[];
  emailCategories: string[];
  emailBrands: string[];
  gender: string;
  previousCategories?: string[];
}

// ─── HTML Fetcher ────────────────────────────────────────────────────────────

async function fetchProductPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractProductNameFromHtml(html: string, url: string): string {
  // 1. OG title
  const og = extractText(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,200})["']/i)
    ?? extractText(html, /<meta[^>]+content=["']([^"']{3,200})["'][^>]+property=["']og:title["']/i);
  if (og && og.length > 10 && !og.toLowerCase().includes("amazon.com")) return og;

  // 2. Twitter title
  const tw = extractText(html, /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']{3,200})["']/i);
  if (tw && tw.length > 10) return tw;

  // 3. <title> tag
  const title = extractText(html, /<title[^>]*>([^<]{3,300})<\/title>/i);
  if (title) {
    // Strip site names like "Amazon.in:", "| Amazon", etc.
    return title
      .replace(/\s*[|\-–]\s*(Amazon[\w\s.]*|Zara|H&M|Myntra|Flipkart|BestBuy|Walmart|Target|ASOS).*$/i, "")
      .replace(/^(Amazon|Myntra|Flipkart)[^:]*:\s*/i, "")
      .trim();
  }

  // 4. H1
  const h1 = extractText(html, /<h1[^>]*>([^<]{3,200})<\/h1>/i);
  if (h1 && h1.length > 5) return h1;

  // 5. Slug fallback
  return extractNameFromUrl(url);
}

function extractNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const parts = pathname.split("/").filter(Boolean);

    // Amazon: /ProductSlug/dp/ASIN or /dp/ASIN
    if (parsed.hostname.includes("amazon")) {
      const dpIdx = parts.indexOf("dp");
      if (dpIdx > 0) {
        // Slug is the part before "dp"
        const slug = parts[dpIdx - 1];
        if (slug && !/^[A-Z0-9]{8,12}$/.test(slug)) {
          return slug
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .slice(0, 100);
        }
      }
      // Also check query string or other parts
      const slugPart = parts.find((p) => p.length > 6 && !/^[A-Z0-9]{8,12}$/.test(p) && p !== "dp" && p !== "gp" && p !== "product");
      if (slugPart) {
        return slugPart
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .slice(0, 100);
      }
    }

    // Myntra/Flipkart/Nykaa: last meaningful path segment
    if (parsed.hostname.includes("myntra") || parsed.hostname.includes("flipkart") || parsed.hostname.includes("nykaa")) {
      // Usually /brand/product-name/buy/...
      const productPart = parts.find((p) => p.length > 8 && !/^\d+$/.test(p) && !["buy", "product", "store"].includes(p));
      if (productPart) {
        return productPart
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .slice(0, 100);
      }
    }

    // Generic: last non-numeric path segment
    const slug = [...parts].reverse().find((p) => p.length > 3 && !/^\d+$/.test(p) && !/^[A-Z0-9]{8,12}$/.test(p)) ?? parts[parts.length - 1] ?? "";
    return slug
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\.(html?|php|aspx?)$/i, "")
      .slice(0, 100)
      || "Unknown Product";
  } catch {
    return "Unknown Product";
  }
}

function extractBrandFromHtml(html: string, url: string): string | null {
  // OG site name
  const og = extractText(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,60})["']/i)
    ?? extractText(html, /<meta[^>]+content=["']([^"']{2,60})["'][^>]+property=["']og:site_name["']/i);
  if (og && !["amazon", "flipkart", "myntra"].includes(og.toLowerCase())) return og;

  // Schema.org brand
  const schema = extractText(html, /"brand"\s*:\s*\{\s*"@type"\s*:\s*"Brand"\s*,\s*"name"\s*:\s*"([^"]{1,60})"/i)
    ?? extractText(html, /"brand"\s*:\s*"([^"]{1,60})"/i);
  if (schema) return schema;

  // Itemprop brand
  const itemprop = extractText(html, /itemprop=["']brand["'][^>]*>([^<]{1,60})</i)
    ?? extractText(html, /<span[^>]*class=["'][^"']*brand[^"']*["'][^>]*>([^<]{1,60})</i);
  if (itemprop) return itemprop;

  // Try domain
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const domain = host.split(".")[0];
    if (!["amazon", "flipkart", "myntra", "snapdeal", "meesho", "ajio", "nykaa"].includes(domain)) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  } catch { /* ignore */ }

  return null;
}

function extractPriceFromHtml(html: string): { price: number | null; currency: string } {
  // OG price
  const ogPrice = extractText(html, /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i);
  const ogCurrency = extractText(html, /<meta[^>]+property=["']product:price:currency["'][^>]+content=["']([^"']+)["']/i);
  if (ogPrice) return { price: parseFloat(ogPrice.replace(/[^0-9.]/g, "")), currency: ogCurrency ?? "USD" };

  // Schema.org
  const schemaPrice = extractText(html, /"price"\s*:\s*"?([0-9,]+\.?[0-9]*)"?/i);
  const schemaCurrency = extractText(html, /"priceCurrency"\s*:\s*"([A-Z]{3})"/i);
  if (schemaPrice) return { price: parseFloat(schemaPrice.replace(/[^0-9.]/g, "")), currency: schemaCurrency ?? "USD" };

  return { price: null, currency: "USD" };
}

// ─── Category Detection ──────────────────────────────────────────────────────

interface CategoryProfile {
  name: string;
  keywords: string[];
  productKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  riskFactors: string[];
  featureScores: ProductIntelligence["featureScores"];
  fitKeywords: string[];
}

const CATEGORIES: CategoryProfile[] = [
  {
    name: "Apparel",
    keywords: ["shirt", "kurta", "kurti", "blouse", "top", "dress", "skirt", "saree", "lehenga", "suit", "salwar", "kameez", "trouser", "pant", "jeans", "shorts", "jacket", "coat", "sweater", "hoodie", "sweatshirt", "clothing", "apparel", "wear", "fashion", "ethnic", "western", "tunic", "palazzo", "dupatta", "churidar", "anarkali", "maxi", "midi", "mini", "cardigan", "blouse", "bodice", "cami", "tank", "tee", "polo"],
    productKeywords: ["cotton", "fabric", "material", "size", "xl", "xxl", "xs", "small", "medium", "large", "fit", "sleeve", "neck", "round", "v-neck", "halter", "backless", "printed", "pattern", "floral", "striped", "solid", "casual", "formal", "ethnic", "party", "festive"],
    strengths: ["Breathable natural fabric", "Versatile styling options", "Comfortable everyday wear", "Unique ethnic design"],
    weaknesses: ["May require special care", "Sizing can vary by brand", "Colors may fade after multiple washes"],
    riskFactors: ["Check size chart carefully before ordering", "Hand-wash recommended for longevity", "Knot/tie details may loosen over time"],
    featureScores: { camera: null, battery: null, performance: null, value: 8, design: 8, durability: 7 },
    fitKeywords: ["fashion", "style", "clothing", "ethnic", "casual", "travel", "fitness", "art"],
  },
  {
    name: "Footwear",
    keywords: ["shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "sandal", "sandals", "slipper", "loafer", "heel", "heels", "flat", "moccasin", "oxford", "derby", "wedge", "pump", "stiletto", "flip-flop", "chappal", "jutti", "mojari"],
    productKeywords: ["sole", "insole", "leather", "suede", "rubber", "grip", "cushion", "ankle", "lace"],
    strengths: ["Comfortable insole cushioning", "Durable rubber sole", "Trendy design", "Wide size range"],
    weaknesses: ["May require break-in period", "Sole can wear with heavy use", "Limited breathability"],
    riskFactors: ["Size up if between sizes", "Check return policy — shoes are often non-returnable", "Outdoor wear may scuff quickly"],
    featureScores: { camera: null, battery: null, performance: 7, value: 7, design: 8, durability: 7 },
    fitKeywords: ["fashion", "sneakers", "fitness", "running", "travel", "streetwear"],
  },
  {
    name: "Smartphones",
    keywords: ["iphone", "galaxy", "pixel", "smartphone", "mobile", "phone", "oneplus", "xiaomi", "redmi", "poco", "realme", "oppo", "vivo", "motorola", "nothing phone", "5g phone", "android"],
    productKeywords: ["ram", "storage", "battery", "mah", "camera", "mp", "display", "amoled", "processor", "chip", "5g", "nfc"],
    strengths: ["High-resolution camera", "Fast processor", "Long battery life", "Premium build quality"],
    weaknesses: ["High price for premium models", "Battery may degrade over 2 years", "Fragile glass back"],
    riskFactors: ["Drop damage not covered under warranty", "Software updates end after 3-4 years", "Battery capacity decreases over time"],
    featureScores: { camera: 8, battery: 7, performance: 8, value: 7, design: 8, durability: 7 },
    fitKeywords: ["tech", "gadgets", "photography", "gaming", "content creation"],
  },
  {
    name: "Laptops",
    keywords: ["laptop", "notebook", "macbook", "chromebook", "ultrabook", "thinkpad", "inspiron", "xps", "ideapad", "aspire", "gaming laptop", "workstation"],
    productKeywords: ["ram", "ssd", "processor", "intel", "amd", "nvidia", "display", "inch", "ghz", "cores", "battery life"],
    strengths: ["Powerful multi-core processor", "Fast SSD storage", "High-resolution display", "Portable form factor"],
    weaknesses: ["Expensive for premium configs", "Battery life varies under load", "Not upgradeable on thin models"],
    riskFactors: ["Fan noise under sustained load", "Thermal throttling on thin chassis", "Repair costs high outside warranty"],
    featureScores: { camera: null, battery: 8, performance: 9, value: 6, design: 8, durability: 8 },
    fitKeywords: ["tech", "coding", "design", "content creation", "gaming", "work"],
  },
  {
    name: "Audio",
    keywords: ["headphone", "earphone", "earbuds", "airpods", "speaker", "soundbar", "tws", "wireless earbuds", "neckband", "noise cancelling", "noise-cancelling", "audiophile", "wired earphones"],
    productKeywords: ["bass", "sound", "audio", "bluetooth", "anc", "microphone", "frequency", "impedance", "driver"],
    strengths: ["Clear audio reproduction", "Effective noise isolation", "Comfortable for extended wear", "Good microphone quality"],
    weaknesses: ["Battery dependent for wireless", "May feel tight after long sessions", "Call quality can vary"],
    riskFactors: ["Ear tips can degrade over 1-2 years", "Firmware updates may change sound signature", "Connectivity issues in crowded spaces"],
    featureScores: { camera: null, battery: 8, performance: 8, value: 7, design: 8, durability: 7 },
    fitKeywords: ["music", "gaming", "content creation", "travel", "coding"],
  },
  {
    name: "Skincare & Beauty",
    keywords: ["moisturizer", "serum", "cleanser", "toner", "sunscreen", "spf", "retinol", "vitamin c", "niacinamide", "hyaluronic", "face wash", "lip balm", "eye cream", "foundation", "lipstick", "mascara", "blush", "concealer", "primer", "highlighter", "skincare", "makeup", "cosmetics", "perfume", "fragrance", "deodorant"],
    productKeywords: ["skin", "pore", "brightening", "hydrating", "anti-aging", "acne", "glow", "ml", "oz", "formula", "dermatologist"],
    strengths: ["Dermatologist-tested formula", "Effective active ingredients", "Suitable for daily use", "Visible results within weeks"],
    weaknesses: ["Results vary by skin type", "May cause initial purging", "Fragrance can irritate sensitive skin"],
    riskFactors: ["Patch test before full application", "May not work for all skin tones", "Sun sensitivity with retinol/AHA products"],
    featureScores: { camera: null, battery: null, performance: 8, value: 8, design: 7, durability: 8 },
    fitKeywords: ["skincare", "beauty", "wellness", "health", "self-care"],
  },
  {
    name: "Fitness & Sports",
    keywords: ["dumbbell", "barbell", "treadmill", "yoga mat", "resistance band", "protein", "supplement", "gym", "fitness", "workout", "exercise", "cycle", "bicycle", "running shoes", "sports", "cricket", "football", "badminton", "tennis", "squash", "swimming"],
    productKeywords: ["reps", "sets", "kg", "lbs", "cardio", "strength", "endurance", "stretch"],
    strengths: ["Supports active lifestyle goals", "Durable construction", "Good grip/traction", "Effective for target muscle groups"],
    weaknesses: ["May need assembly", "Takes time to see results", "Can be bulky to store"],
    riskFactors: ["Risk of injury without proper form", "Requires regular maintenance", "Check weight capacity before purchase"],
    featureScores: { camera: null, battery: null, performance: 8, value: 7, design: 7, durability: 8 },
    fitKeywords: ["fitness", "gym", "running", "yoga", "sports", "health", "wellness"],
  },
  {
    name: "Home & Decor",
    keywords: ["sofa", "couch", "table", "chair", "bed", "mattress", "pillow", "curtain", "lamp", "decor", "vase", "rug", "carpet", "shelf", "wardrobe", "cabinet", "drawer", "kitchen", "cookware", "utensil", "pot", "pan", "blender", "mixer", "appliance", "home", "furniture"],
    productKeywords: ["wood", "steel", "plastic", "dimensions", "cm", "inch", "color", "assembly"],
    strengths: ["Sturdy construction", "Aesthetic design", "Easy to assemble", "Space-efficient"],
    weaknesses: ["Assembly required", "May look different in person", "Limited color options"],
    riskFactors: ["Verify dimensions before ordering", "Delivery damage possible for large items", "Returns can be difficult"],
    featureScores: { camera: null, battery: null, performance: 7, value: 7, design: 8, durability: 7 },
    fitKeywords: ["home decor", "minimalism", "design", "cooking", "diy"],
  },
  {
    name: "Books & Media",
    keywords: ["book", "novel", "textbook", "ebook", "kindle", "paperback", "hardcover", "magazine", "comic", "manga"],
    productKeywords: ["author", "pages", "edition", "isbn", "publisher", "fiction", "non-fiction"],
    strengths: ["Expand knowledge and perspective", "Great value for time invested", "Portable entertainment"],
    weaknesses: ["Static content, no interactivity", "Physical books can be heavy"],
    riskFactors: ["Verify edition is current if technical topic", "Check language availability"],
    featureScores: { camera: null, battery: null, performance: 9, value: 9, design: 7, durability: 7 },
    fitKeywords: ["reading", "learning", "design", "coding", "art"],
  },
  {
    name: "Cameras & Photography",
    keywords: ["camera", "dslr", "mirrorless", "lens", "tripod", "gopro", "action camera", "webcam", "ring light", "studio light", "photography"],
    productKeywords: ["megapixel", "mp", "sensor", "aperture", "iso", "shutter", "4k", "fps", "zoom"],
    strengths: ["High-resolution image capture", "Versatile shooting modes", "Good low-light performance", "Durable build"],
    weaknesses: ["Heavy/bulky body", "Complex settings for beginners", "Expensive lens ecosystem"],
    riskFactors: ["Sensor dust on interchangeable lens cameras", "Memory cards add to cost", "Check warranty terms"],
    featureScores: { camera: 9, battery: 6, performance: 8, value: 7, design: 8, durability: 8 },
    fitKeywords: ["photography", "vlogging", "travel", "content creation", "art"],
  },
  {
    name: "Gaming",
    keywords: ["gaming", "game", "console", "playstation", "xbox", "nintendo", "switch", "controller", "joystick", "gaming headset", "mechanical keyboard", "gaming mouse", "gaming chair", "gpu", "graphics card"],
    productKeywords: ["fps", "hz", "refresh rate", "rgb", "dpi", "latency", "ms", "wireless"],
    strengths: ["Immersive gaming experience", "Low latency input", "Durable for heavy use", "Ergonomic design"],
    weaknesses: ["Premium price for high-end gear", "May require software setup", "RGB lighting drains battery on wireless"],
    riskFactors: ["Driver compatibility issues possible", "Check PC specs compatibility", "Warranty claims can be slow"],
    featureScores: { camera: null, battery: 7, performance: 9, value: 7, design: 8, durability: 8 },
    fitKeywords: ["gaming", "tech", "gadgets", "content creation"],
  },
];

const DEFAULT_CATEGORY: CategoryProfile = {
  name: "General",
  keywords: [],
  productKeywords: [],
  strengths: ["Meets standard quality expectations", "Practical everyday utility", "Good value for price"],
  weaknesses: ["Limited reviews available", "Brand credibility unclear"],
  riskFactors: ["Verify seller reputation before buying", "Check return policy", "Compare with alternatives"],
  featureScores: { camera: null, battery: null, performance: 7, value: 7, design: 7, durability: 7 },
  fitKeywords: [],
};

function detectCategory(productName: string, pageText: string): CategoryProfile {
  const combined = (productName + " " + pageText).toLowerCase();

  let bestMatch: CategoryProfile | null = null;
  let bestScore = 0;

  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (combined.includes(kw.toLowerCase())) score += 2;
    }
    for (const kw of cat.productKeywords) {
      if (combined.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = cat;
    }
  }

  return bestMatch && bestScore >= 2 ? bestMatch : DEFAULT_CATEGORY;
}

// ─── Live Product Fetch ──────────────────────────────────────────────────────

function looksLikeAsin(name: string): boolean {
  return /^[A-Z0-9]{8,12}$/.test(name.trim());
}

async function buildProductIntelligenceFromWeb(url: string): Promise<ProductIntelligence> {
  let html = "";
  try {
    html = await fetchProductPage(url);
  } catch {
    html = "";
  }

  let productName = extractNameFromUrl(url);

  if (html && html.length > 500) {
    const htmlName = extractProductNameFromHtml(html, url);
    // Prefer HTML name unless it looks like an ASIN or site name
    if (
      htmlName &&
      htmlName.length > 8 &&
      !looksLikeAsin(htmlName) &&
      !htmlName.toLowerCase().includes("amazon.") &&
      !htmlName.toLowerCase().includes("sign in") &&
      !htmlName.toLowerCase().includes("captcha")
    ) {
      productName = htmlName;
    }
  }

  const brand = (html ? extractBrandFromHtml(html, url) : null) ?? extractBrandFromUrl(url);
  const { price, currency } = html ? extractPriceFromHtml(html) : { price: null, currency: "USD" };

  // Use a condensed version of the page text to avoid processing huge HTML
  const pageText = html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 5000) : "";
  const cat = detectCategory(productName, pageText);

  // Adjust value score based on price
  const featureScores = { ...cat.featureScores };
  if (price) {
    if (price < 500) featureScores.value = Math.min(10, (featureScores.value ?? 7) + 1);
    else if (price > 5000) featureScores.value = Math.max(1, (featureScores.value ?? 7) - 2);
  }

  return {
    productName,
    category: cat.name,
    brand,
    price,
    currency,
    strengths: cat.strengths,
    weaknesses: cat.weaknesses,
    riskFactors: cat.riskFactors,
    featureScores,
    keywords: cat.fitKeywords,
  };
}

function extractBrandFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const domain = host.split(".")[0];
    const retailers = ["amazon", "flipkart", "myntra", "snapdeal", "meesho", "ajio", "nykaa", "bestbuy", "walmart", "target", "zara", "hm", "asos"];
    if (!retailers.includes(domain)) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  } catch { /* ignore */ }
  return "Unknown";
}

// ─── Score Engine ────────────────────────────────────────────────────────────

function computeFitScore(
  product: ProductIntelligence,
  user: UserContext,
  boostedFeatures: string[] = []
): { fitScore: number; whyItFitsYou: string[]; whyItMayNot: string[]; riskLevel: string } {
  let score = 50;
  const whyItFitsYou: string[] = [];
  const whyItMayNot: string[] = [];

  // 1. Interest match
  const userInterestsLower = user.interests.map((i) => i.toLowerCase());
  const productKeywordsLower = product.keywords.map((k) => k.toLowerCase());
  const interestMatches = productKeywordsLower.filter((k) =>
    userInterestsLower.some((i) => i.includes(k) || k.includes(i))
  );

  if (interestMatches.length >= 3) {
    score += 20;
    whyItFitsYou.push(`Strongly aligns with your interests in ${interestMatches.slice(0, 2).join(" and ")}`);
  } else if (interestMatches.length >= 1) {
    score += 10;
    whyItFitsYou.push(`Matches your interest in ${interestMatches[0]}`);
  } else {
    score -= 5;
    whyItMayNot.push("Product doesn't closely match your stated interests");
  }

  // 2. Feature quality
  const scores = Object.values(product.featureScores).filter((s): s is number => s !== null);
  const avgFeatureScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 7;
  score += (avgFeatureScore - 5) * 2;
  if (avgFeatureScore >= 8) whyItFitsYou.push("Above-average quality across all measured dimensions");

  // 3. Boost for selected features
  for (const feat of boostedFeatures) {
    const featKey = feat.toLowerCase() as keyof typeof product.featureScores;
    const featScore = product.featureScores[featKey];
    if (featScore !== null && featScore !== undefined) {
      if (featScore >= 8) {
        score += 8;
        whyItFitsYou.push(`Excellent ${feat} score (${featScore}/10) — exactly what you prioritized`);
      } else if (featScore >= 6) {
        score += 3;
        whyItFitsYou.push(`${feat} performance is solid (${featScore}/10)`);
      } else {
        score -= 5;
        whyItMayNot.push(`${feat} is below your expectations (${featScore}/10)`);
      }
    }
  }

  // 4. Email purchase history match
  if (user.emailCategories.length > 0) {
    const catLower = product.category.toLowerCase();
    if (user.emailCategories.some((c) => catLower.includes(c.toLowerCase()) || c.toLowerCase().includes(catLower.split(" ")[0]))) {
      score += 7;
      whyItFitsYou.push("You frequently purchase in this category — a familiar buy for you");
    }
  }
  if (user.emailBrands.length > 0 && product.brand) {
    if (user.emailBrands.some((b) => b.toLowerCase() === product.brand!.toLowerCase())) {
      score += 5;
      whyItFitsYou.push(`You've bought from ${product.brand} before — already a trusted brand for you`);
    }
  }

  // 5. Risk penalty
  score -= Math.min(product.riskFactors.length * 2, 10);
  if (product.riskFactors.length > 2) {
    whyItMayNot.push(`Notable risk: ${product.riskFactors[0].toLowerCase()}`);
  }

  // 6. Value check
  if (product.weaknesses.some((w) => w.toLowerCase().includes("price") || w.toLowerCase().includes("expensive"))) {
    score -= 3;
    whyItMayNot.push("Premium-priced — consider whether value justifies cost for you");
  }

  if (whyItFitsYou.length === 0) whyItFitsYou.push("Product meets quality standards in its category");
  if (whyItMayNot.length === 0) whyItMayNot.push("No major mismatches detected based on your profile");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel = product.riskFactors.length >= 3 ? "High" : product.riskFactors.length >= 2 ? "Medium" : "Low";

  return { fitScore: score, whyItFitsYou, whyItMayNot, riskLevel };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function analyzeProductForUser(
  url: string,
  userContext: UserContext,
  boostedFeatures: string[] = []
) {
  const product = await buildProductIntelligenceFromWeb(url);
  const { fitScore, whyItFitsYou, whyItMayNot, riskLevel } = computeFitScore(product, userContext, boostedFeatures);

  const boostableFeatures = Object.entries(product.featureScores)
    .filter(([, v]) => v !== null)
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

  return {
    productName: product.productName,
    productUrl: url,
    category: product.category,
    brand: product.brand,
    price: product.price,
    currency: product.currency,
    fitScore,
    riskLevel,
    strengths: product.strengths,
    weaknesses: product.weaknesses,
    riskFactors: product.riskFactors,
    whyItFitsYou,
    whyItMayNot,
    featureScores: product.featureScores,
    boostableFeatures,
    analyzedAt: new Date().toISOString(),
  };
}
