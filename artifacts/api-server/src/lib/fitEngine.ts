interface ProductIntelligence {
  productName: string;
  category: string;
  brand: string;
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

function extractProductInfo(url: string): ProductIntelligence {
  const lower = url.toLowerCase();

  // Detect category from URL keywords
  if (lower.includes("iphone") || lower.includes("samsung") || lower.includes("pixel") || lower.includes("phone") || lower.includes("smartphone")) {
    const isApple = lower.includes("apple") || lower.includes("iphone");
    const isSamsung = lower.includes("samsung");
    return {
      productName: isApple ? "Apple iPhone 16 Pro" : isSamsung ? "Samsung Galaxy S25 Ultra" : "OnePlus 13 Pro",
      category: "Smartphones",
      brand: isApple ? "Apple" : isSamsung ? "Samsung" : "OnePlus",
      strengths: ["Exceptional camera system", "Smooth performance", "Premium build quality", "Large app ecosystem"],
      weaknesses: ["High price point", "Battery capacity could be better", "Limited customization"],
      featureScores: { camera: 9, battery: 7, performance: 9, value: isApple ? 6 : 8, design: 9, durability: 8 },
      riskFactors: ["Battery degradation after 18 months", "High repair costs", "Software updates may slow older models"],
      keywords: ["tech", "gadgets", "photography", "smartphone"],
    };
  }

  if (lower.includes("laptop") || lower.includes("macbook") || lower.includes("notebook") || lower.includes("thinkpad") || lower.includes("dell") || lower.includes("lenovo")) {
    const isApple = lower.includes("apple") || lower.includes("macbook");
    return {
      productName: isApple ? "MacBook Pro 16\" M4 Pro" : "Dell XPS 15",
      category: "Laptops",
      brand: isApple ? "Apple" : "Dell",
      strengths: ["Powerful performance", "Long battery life", "Excellent display", "Lightweight design"],
      weaknesses: ["Expensive", "Limited ports", "Not upgradeable"],
      featureScores: { camera: null, battery: 9, performance: 10, value: 5, design: 9, durability: 8 },
      riskFactors: ["Fan noise under heavy load", "Thermal throttling", "Costly repairs out of warranty"],
      keywords: ["tech", "coding", "work", "productivity"],
    };
  }

  if (lower.includes("shoe") || lower.includes("sneaker") || lower.includes("nike") || lower.includes("adidas") || lower.includes("jordan")) {
    const isNike = lower.includes("nike") || lower.includes("jordan") || lower.includes("air");
    return {
      productName: isNike ? "Nike Air Force 1 Low" : "Adidas Ultraboost 23",
      category: "Footwear",
      brand: isNike ? "Nike" : "Adidas",
      strengths: ["Iconic design", "Versatile styling", "High brand recognition", "Durable sole"],
      weaknesses: ["Can run narrow", "Not ideal for serious running", "Price premium for brand"],
      featureScores: { camera: null, battery: null, performance: 7, value: 6, design: 9, durability: 7 },
      riskFactors: ["Sizing inconsistency", "Color may fade with regular wash", "Sole can crease"],
      keywords: ["fashion", "sneakers", "streetwear", "fitness"],
    };
  }

  if (lower.includes("t-shirt") || lower.includes("tshirt") || lower.includes("shirt") || lower.includes("jacket") || lower.includes("hoodie") || lower.includes("jeans") || lower.includes("apparel") || lower.includes("clothing") || lower.includes("zara") || lower.includes("h&m")) {
    return {
      productName: "Premium Cotton Oversized Hoodie",
      category: "Apparel",
      brand: "Zara",
      strengths: ["High-quality fabric", "Trendy silhouette", "Easy to style", "Machine washable"],
      weaknesses: ["Limited color options", "May shrink after wash", "Sizing can be inconsistent"],
      featureScores: { camera: null, battery: null, performance: null, value: 7, design: 8, durability: 7 },
      riskFactors: ["Color fading after multiple washes", "Fabric may pill over time"],
      keywords: ["fashion", "streetwear", "minimalism", "style"],
    };
  }

  if (lower.includes("headphone") || lower.includes("airpod") || lower.includes("earphone") || lower.includes("earbud") || lower.includes("speaker") || lower.includes("sony") || lower.includes("bose")) {
    const isSony = lower.includes("sony");
    return {
      productName: isSony ? "Sony WH-1000XM5 Headphones" : "Apple AirPods Pro (2nd Gen)",
      category: "Audio",
      brand: isSony ? "Sony" : "Apple",
      strengths: ["Industry-leading noise cancellation", "Excellent sound quality", "30-hour battery", "Comfortable for long wear"],
      weaknesses: ["Premium price", "Case is bulky", "Touch controls have learning curve"],
      featureScores: { camera: null, battery: 9, performance: 9, value: 7, design: 8, durability: 8 },
      riskFactors: ["Ear cup padding wears over 2 years", "Bluetooth connectivity issues with some devices"],
      keywords: ["music", "gaming", "travel", "tech", "content creation"],
    };
  }

  if (lower.includes("camera") || lower.includes("canon") || lower.includes("nikon") || lower.includes("fuji") || lower.includes("gopro")) {
    return {
      productName: "Sony A7 IV Mirrorless Camera",
      category: "Cameras",
      brand: "Sony",
      strengths: ["33MP full-frame sensor", "Exceptional autofocus", "4K video recording", "Weather sealed"],
      weaknesses: ["Heavy body", "Complex menu system", "Expensive ecosystem"],
      featureScores: { camera: 10, battery: 6, performance: 9, value: 7, design: 8, durability: 8 },
      riskFactors: ["Battery life limited to ~580 shots", "Memory cards expensive", "Steep learning curve"],
      keywords: ["photography", "vlogging", "content creation", "travel"],
    };
  }

  if (lower.includes("watch") || lower.includes("fitbit") || lower.includes("garmin") || lower.includes("apple watch")) {
    const isApple = lower.includes("apple");
    return {
      productName: isApple ? "Apple Watch Series 10" : "Garmin Forerunner 965",
      category: "Wearables",
      brand: isApple ? "Apple" : "Garmin",
      strengths: ["Advanced health tracking", "GPS accuracy", "Long battery life (Garmin)", "Stylish design"],
      weaknesses: ["Apple Watch: only 18hr battery", "Requires phone for full features", "Screen scratches easily"],
      featureScores: { camera: null, battery: isApple ? 5 : 9, performance: 8, value: 7, design: 9, durability: 7 },
      riskFactors: ["Band wear over time", "Battery replacement expensive", "Water resistance degrades"],
      keywords: ["fitness", "running", "health", "wellness", "tech"],
    };
  }

  if (lower.includes("skincare") || lower.includes("moisturizer") || lower.includes("serum") || lower.includes("cleanser") || lower.includes("cerave") || lower.includes("ordinary") || lower.includes("beauty")) {
    return {
      productName: "The Ordinary Niacinamide 10% + Zinc 1%",
      category: "Skincare",
      brand: "The Ordinary",
      strengths: ["Reduces pore appearance", "Controls sebum", "Brightens skin tone", "Affordable price"],
      weaknesses: ["May cause purging initially", "Not suitable for all skin types", "Slow results"],
      featureScores: { camera: null, battery: null, performance: 8, value: 9, design: 7, durability: 8 },
      riskFactors: ["Initial breakout possible", "May interact with Vitamin C products", "Results vary by skin type"],
      keywords: ["skincare", "beauty", "wellness", "health"],
    };
  }

  // Default: generic product
  return {
    productName: "Premium Smart Home Speaker",
    category: "Smart Home",
    brand: "Amazon",
    strengths: ["Voice assistant integration", "Multi-room audio", "Easy setup", "Affordable price"],
    weaknesses: ["Privacy concerns", "Requires constant internet", "Limited premium audio quality"],
    featureScores: { camera: null, battery: null, performance: 7, value: 8, design: 7, durability: 7 },
    riskFactors: ["Data privacy with always-on microphone", "Dependent on cloud services"],
    keywords: ["tech", "home decor", "gadgets"],
  };
}

function computeFitScore(
  product: ProductIntelligence,
  user: UserContext,
  boostedFeatures: string[] = []
): { fitScore: number; whyItFitsYou: string[]; whyItMayNot: string[]; riskLevel: string } {
  let score = 50; // base
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
    whyItMayNot.push("This product doesn't closely match your stated interests");
  }

  // 2. Feature scores
  const scores = Object.values(product.featureScores).filter((s): s is number => s !== null);
  const avgFeatureScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 7;
  const featureBonus = (avgFeatureScore - 5) * 2; // -10 to +10
  score += featureBonus;

  if (avgFeatureScore >= 8) {
    whyItFitsYou.push("Above-average feature quality across all measured dimensions");
  }

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
        whyItFitsYou.push(`${feat} performance is decent (${featScore}/10), though not best-in-class`);
      } else {
        score -= 5;
        whyItMayNot.push(`${feat} is below your expectations (${featScore}/10)`);
      }
    }
  }

  // 4. Email integration match
  if (user.emailCategories.length > 0) {
    const categoryLower = product.category.toLowerCase();
    if (user.emailCategories.some((c) => categoryLower.includes(c.toLowerCase()) || c.toLowerCase().includes(categoryLower.split(" ")[0]))) {
      score += 7;
      whyItFitsYou.push(`Based on your purchase history, you frequently buy in this category`);
    }
  }
  if (user.emailBrands.length > 0) {
    if (user.emailBrands.some((b) => b.toLowerCase() === product.brand.toLowerCase())) {
      score += 5;
      whyItFitsYou.push(`You've purchased from ${product.brand} before — a familiar brand for you`);
    }
  }

  // 5. Risk penalty
  const riskPenalty = product.riskFactors.length * 2;
  score -= Math.min(riskPenalty, 10);

  if (product.riskFactors.length > 2) {
    whyItMayNot.push(`Multiple risk factors identified: ${product.riskFactors[0].toLowerCase()}`);
  }

  // 6. Value penalty if weaknesses include price
  if (product.weaknesses.some((w) => w.toLowerCase().includes("price") || w.toLowerCase().includes("expensive"))) {
    score -= 3;
    whyItMayNot.push("This product is premium-priced, which may not align with value priorities");
  }

  if (whyItFitsYou.length === 0) {
    whyItFitsYou.push("Product meets baseline quality standards for this category");
  }
  if (whyItMayNot.length === 0) {
    whyItMayNot.push("No major mismatches detected based on your profile");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const riskLevel = product.riskFactors.length >= 3 ? "High" : product.riskFactors.length >= 2 ? "Medium" : "Low";

  return { fitScore: score, whyItFitsYou, whyItMayNot, riskLevel };
}

export function analyzeProductForUser(
  url: string,
  userContext: UserContext,
  boostedFeatures: string[] = []
) {
  const product = extractProductInfo(url);
  const { fitScore, whyItFitsYou, whyItMayNot, riskLevel } = computeFitScore(product, userContext, boostedFeatures);

  // Boostable features: those that have scores
  const boostableFeatures = Object.entries(product.featureScores)
    .filter(([, v]) => v !== null)
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

  return {
    productName: product.productName,
    productUrl: url,
    category: product.category,
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
