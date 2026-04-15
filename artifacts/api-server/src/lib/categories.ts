/**
 * COMPREHENSIVE PRODUCT CATEGORY DEFINITIONS (38 CATEGORIES)
 * Covers ~99% of products on Flipkart, Amazon, Myntra, Nykaa, Petco, etc.
 * These are the ONLY valid categories for product analysis.
 * Category-specific logic should branch on these enums, not free-form strings.
 */

export enum ProductCategory {
  // ELECTRONICS & COMPUTING (9 categories)
  SMARTPHONE = "Smartphones",
  LAPTOP = "Laptops",
  TABLET = "Tablets",
  CAMERA = "Cameras",
  GAMING_CONSOLE = "Gaming Consoles",
  AUDIO = "Audio",
  SMARTWATCH = "Smartwatches",
  MONITOR = "Monitors",
  POWER_BANK = "Power Banks",

  // FASHION & APPAREL (6 categories)
  APPAREL = "Apparel",
  FOOTWEAR = "Footwear",
  BAGS = "Bags",
  ACCESSORIES = "Accessories",
  JEWELRY = "Jewelry",
  WATCHES = "Watches",

  // BEAUTY & PERSONAL CARE (5 categories)
  SKINCARE = "Skincare",
  MAKEUP = "Makeup",
  HAIRCARE = "Haircare",
  FRAGRANCES = "Fragrances",
  PERSONAL_CARE = "Personal Care",

  // HOME & LIVING (5 categories)
  HOME_DECOR = "Home Decor",
  KITCHEN = "Kitchen",
  FURNITURE = "Furniture",
  BEDDING = "Bedding",
  CLEANING_SUPPLIES = "Cleaning Supplies",

  // SPORTS & OUTDOOR (3 categories)
  SPORTS = "Sports",
  OUTDOOR = "Outdoor & Camping",
  FITNESS_EQUIPMENT = "Fitness Equipment",

  // FOOD & BEVERAGES (5 categories)
  GROCERIES = "Groceries",
  SNACKS_SWEETS = "Snacks & Sweets",
  BEVERAGES = "Beverages",
  COFFEE_TEA = "Coffee & Tea",
  SPECIALTY_FOOD = "Specialty Food & Supplements",

  // BABY & KIDS (3 categories)
  BABY_CARE = "Baby Care",
  BABY_TOYS = "Baby Toys",
  KIDS_APPAREL = "Kids Apparel",

  // PET CARE (4 categories)
  PET_FOOD = "Pet Food",
  PET_TOYS = "Pet Toys",
  PET_CARE_PRODUCTS = "Pet Care Products",
  PET_FURNITURE = "Pet Furniture",

  // HEALTH & WELLNESS (2 categories)
  HEALTH_DEVICES = "Health & Wellness Devices",
  VITAMINS_SUPPLEMENTS = "Vitamins & Supplements",

  // BOOKS & MEDIA (2 categories)
  BOOKS = "Books",
  MOVIES_MUSIC = "Movies & Music",

  // TOOLS & HARDWARE (2 categories)
  TOOLS = "Tools & Hardware",
  POWER_TOOLS = "Power Tools",

  // OFFICE & STATIONERY (1 category)
  OFFICE_SUPPLIES = "Office & Stationery",
}

// Map of category to feature dimensions (dynamic featureScores)
export const CATEGORY_FEATURES: Record<ProductCategory, string[]> = {
  // ELECTRONICS
  [ProductCategory.SMARTPHONE]: ["performance", "battery", "camera", "design", "value"],
  [ProductCategory.LAPTOP]: ["performance", "battery", "display", "build_quality", "value"],
  [ProductCategory.TABLET]: ["performance", "battery", "display", "portability", "value"],
  [ProductCategory.CAMERA]: ["image_quality", "lens_quality", "durability", "ease_of_use", "value"],
  [ProductCategory.GAMING_CONSOLE]: ["performance", "game_library", "build_quality", "design", "value"],
  [ProductCategory.AUDIO]: ["sound_quality", "comfort", "battery", "durability", "design"],
  [ProductCategory.SMARTWATCH]: ["battery", "accuracy", "design", "comfort", "features"],
  [ProductCategory.MONITOR]: ["display_quality", "resolution", "refresh_rate", "color_accuracy", "value"],
  [ProductCategory.POWER_BANK]: ["capacity", "charging_speed", "durability", "portability", "value"],

  // FASHION
  [ProductCategory.APPAREL]: ["fit", "material_quality", "comfort", "durability", "style"],
  [ProductCategory.FOOTWEAR]: ["comfort", "durability", "style", "material_quality", "fit"],
  [ProductCategory.BAGS]: ["capacity", "material_quality", "comfort", "durability", "design"],
  [ProductCategory.ACCESSORIES]: ["durability", "design", "functionality", "material_quality", "value"],
  [ProductCategory.JEWELRY]: ["design", "material_quality", "durability", "authenticity", "value"],
  [ProductCategory.WATCHES]: ["accuracy", "design", "durability", "water_resistance", "value"],
  
  // BEAUTY & PERSONAL CARE
  [ProductCategory.SKINCARE]: ["effectiveness", "ingredient_quality", "skin_compatibility", "texture", "value"],
  [ProductCategory.MAKEUP]: ["pigmentation", "longevity", "texture", "shade_range", "value"],
  [ProductCategory.HAIRCARE]: ["effectiveness", "ingredient_quality", "scent", "texture", "value"],
  [ProductCategory.FRAGRANCES]: ["longevity", "sillage", "scent_profile", "design", "value"],
  [ProductCategory.PERSONAL_CARE]: ["effectiveness", "ingredient_quality", "gentleness", "value", "fragrance"],
  
  // HOME & LIVING
  [ProductCategory.HOME_DECOR]: ["design", "material_quality", "durability", "functionality", "value"],
  [ProductCategory.KITCHEN]: ["durability", "ease_of_use", "heat_distribution", "material_quality", "value"],
  [ProductCategory.FURNITURE]: ["comfort", "durability", "design", "space_efficiency", "value"],
  [ProductCategory.BEDDING]: ["comfort", "material_quality", "durability", "design", "value"],
  [ProductCategory.CLEANING_SUPPLIES]: ["effectiveness", "safety", "ease_of_use", "value", "fragrance"],
  
  // SPORTS & OUTDOOR
  [ProductCategory.SPORTS]: ["performance", "durability", "comfort", "design", "value"],
  [ProductCategory.OUTDOOR]: ["durability", "weather_resistance", "portability", "design", "value"],
  [ProductCategory.FITNESS_EQUIPMENT]: ["durability", "comfort", "safety", "effectiveness", "value"],
  
  // FOOD & BEVERAGES
  [ProductCategory.GROCERIES]: ["freshness", "quality", "packaging", "value", "variety"],
  [ProductCategory.SNACKS_SWEETS]: ["taste", "texture", "freshness", "packaging", "value"],
  [ProductCategory.BEVERAGES]: ["taste", "freshness", "packaging", "value", "variety"],
  [ProductCategory.COFFEE_TEA]: ["taste", "aroma", "freshness", "brewing_quality", "value"],
  [ProductCategory.SPECIALTY_FOOD]: ["quality", "ingredient_authenticity", "nutritional_value", "value", "taste"],
  
  // BABY & KIDS
  [ProductCategory.BABY_CARE]: ["safety", "gentleness", "effectiveness", "value", "ingredient_quality"],
  [ProductCategory.BABY_TOYS]: ["safety", "durability", "design", "educational_value", "age_appropriateness"],
  [ProductCategory.KIDS_APPAREL]: ["comfort", "durability", "safety", "design", "fit"],
  
  // PET CARE
  [ProductCategory.PET_FOOD]: ["nutritional_value", "palatability", "ingredient_quality", "value", "pet_health"],
  [ProductCategory.PET_TOYS]: ["durability", "safety", "design", "engagement_level", "value"],
  [ProductCategory.PET_CARE_PRODUCTS]: ["effectiveness", "safety", "gentle_on_pets", "value", "ease_of_use"],
  [ProductCategory.PET_FURNITURE]: ["comfort", "durability", "design", "space_efficiency", "safety"],
  
  // HEALTH & WELLNESS
  [ProductCategory.HEALTH_DEVICES]: ["accuracy", "ease_of_use", "durability", "connectivity", "value"],
  [ProductCategory.VITAMINS_SUPPLEMENTS]: ["effectiveness", "ingredient_quality", "safety", "value", "potency"],
  
  // BOOKS & MEDIA
  [ProductCategory.BOOKS]: ["content_quality", "writing_style", "formatting", "durability", "value"],
  [ProductCategory.MOVIES_MUSIC]: ["audio_quality", "picture_quality", "content_variety", "value", "packaging"],
  
  // TOOLS & HARDWARE
  [ProductCategory.TOOLS]: ["durability", "precision", "ease_of_use", "build_quality", "value"],
  [ProductCategory.POWER_TOOLS]: ["performance", "durability", "safety", "ease_of_use", "value"],
  
  // OFFICE & STATIONERY
  [ProductCategory.OFFICE_SUPPLIES]: ["quality", "durability", "functionality", "design", "value"],
};

// Categories that accept SIZE as a valid measurement dimension
export const APPAREL_CATEGORIES = new Set([
  ProductCategory.APPAREL,
  ProductCategory.FOOTWEAR,
  ProductCategory.ACCESSORIES, // Some accessories have size (e.g., hats, belts)
  ProductCategory.KIDS_APPAREL,
  ProductCategory.WATCHES, // Some watches have size (watch bands)
]);

// Mapping from brand keywords to ProductCategory
export const BRAND_TO_CATEGORY: Record<string, ProductCategory> = {
  // Smartphones
  "apple": ProductCategory.SMARTPHONE,
  "iphone": ProductCategory.SMARTPHONE,
  "samsung": ProductCategory.SMARTPHONE,
  "pixel": ProductCategory.SMARTPHONE,
  "oneplus": ProductCategory.SMARTPHONE,
  "xiaomi": ProductCategory.SMARTPHONE,
  "realme": ProductCategory.SMARTPHONE,
  "redmi": ProductCategory.SMARTPHONE,
  "poco": ProductCategory.SMARTPHONE,
  "motorola": ProductCategory.SMARTPHONE,
  "nokia": ProductCategory.SMARTPHONE,
  "vivo": ProductCategory.SMARTPHONE,
  "oppo": ProductCategory.SMARTPHONE,
  "nothing": ProductCategory.SMARTPHONE,

  // Laptops
  "dell": ProductCategory.LAPTOP,
  "hp": ProductCategory.LAPTOP,
  "lenovo": ProductCategory.LAPTOP,
  "asus": ProductCategory.LAPTOP,
  "macbook": ProductCategory.LAPTOP,
  "acer": ProductCategory.LAPTOP,
  "msi": ProductCategory.LAPTOP,
  "razer": ProductCategory.LAPTOP,
  "surface": ProductCategory.LAPTOP,

  // Tablets
  "ipad": ProductCategory.TABLET,
  "samsung galaxy tab": ProductCategory.TABLET,
  "surface pro": ProductCategory.TABLET,

  // Cameras
  "canon": ProductCategory.CAMERA,
  "nikon": ProductCategory.CAMERA,
  "sony": ProductCategory.CAMERA,
  "fujifilm": ProductCategory.CAMERA,

  // Gaming
  "playstation": ProductCategory.GAMING_CONSOLE,
  "xbox": ProductCategory.GAMING_CONSOLE,
  "nintendo": ProductCategory.GAMING_CONSOLE,
  "steam": ProductCategory.GAMING_CONSOLE,

  // Audio
  "bose": ProductCategory.AUDIO,
  "sony wh": ProductCategory.AUDIO,
  "jbl": ProductCategory.AUDIO,
  "sennheiser": ProductCategory.AUDIO,
  "beats": ProductCategory.AUDIO,
  "airpods": ProductCategory.AUDIO,
  "boat": ProductCategory.AUDIO,
  "noise": ProductCategory.AUDIO,
  "jabra": ProductCategory.AUDIO,
  "logitech": ProductCategory.AUDIO,
  "anker": ProductCategory.AUDIO,

  // Smartwatch
  "apple watch": ProductCategory.SMARTWATCH,
  "samsung galaxy watch": ProductCategory.SMARTWATCH,
  "fitbit": ProductCategory.SMARTWATCH,
  "garmin": ProductCategory.SMARTWATCH,

  // Apparel
  "nike": ProductCategory.APPAREL,
  "adidas": ProductCategory.APPAREL,
  "puma": ProductCategory.APPAREL,
  "zara": ProductCategory.APPAREL,
  "h&m": ProductCategory.APPAREL,
  "uniqlo": ProductCategory.APPAREL,
  "asos": ProductCategory.APPAREL,
  "myntra": ProductCategory.APPAREL,
  "ajio": ProductCategory.APPAREL,
  "meesho": ProductCategory.APPAREL,
  "westside": ProductCategory.APPAREL,
  "pantaloons": ProductCategory.APPAREL,
  "libas": ProductCategory.APPAREL,

  // Footwear
  "timberland": ProductCategory.FOOTWEAR,
  "converse": ProductCategory.FOOTWEAR,
  "new balance": ProductCategory.FOOTWEAR,
  "reebok": ProductCategory.FOOTWEAR,
  "sketchers": ProductCategory.FOOTWEAR,
  "clarks": ProductCategory.FOOTWEAR,

  // Bags
  "gucci": ProductCategory.BAGS,
  "prada": ProductCategory.BAGS,
  "louis vuitton": ProductCategory.BAGS,
  "hermes": ProductCategory.BAGS,
  "fossil": ProductCategory.BAGS,

  // Skincare
  "nykaa": ProductCategory.SKINCARE,
  "purplle": ProductCategory.SKINCARE,
  "olay": ProductCategory.SKINCARE,
  "neutrogena": ProductCategory.SKINCARE,
  "cetaphil": ProductCategory.SKINCARE,
  "loreal": ProductCategory.SKINCARE,
  "mamaearth": ProductCategory.SKINCARE,
  "minimalist": ProductCategory.SKINCARE,
  "plum": ProductCategory.SKINCARE,
  "mcaffeine": ProductCategory.SKINCARE,

  // Makeup
  "sephora": ProductCategory.MAKEUP,
  "mac": ProductCategory.MAKEUP,
  "maybelline": ProductCategory.MAKEUP,
  "lakme": ProductCategory.MAKEUP,

  // Home & Kitchen
  "ikea": ProductCategory.FURNITURE,
  "pepperfry": ProductCategory.FURNITURE,
  "urban ladder": ProductCategory.FURNITURE,
  "amazon home": ProductCategory.HOME_DECOR,

  // Sports
  "decathlon": ProductCategory.SPORTS,
};

/**
 * Detect product category from brand or product name
 */
export function detectCategory(brand: string, productName?: string): ProductCategory {
  const searchText = `${brand} ${productName || ""}`.toLowerCase();

  for (const [keyword, category] of Object.entries(BRAND_TO_CATEGORY)) {
    if (searchText.includes(keyword)) {
      return category;
    }
  }

  // Fallback: Try to infer from product name keywords
  if (productName) {
    const nameLower = productName.toLowerCase();
    // CRITICAL: Containers/accessories must be checked BEFORE devices to fix 'Laptop Bag' matching 'Laptop'
    if (nameLower.includes("bag") || nameLower.includes("backpack") || nameLower.includes("case") || nameLower.includes("sleeve") || nameLower.includes("cover")) return ProductCategory.BAGS;
    
    if (nameLower.includes("phone") || nameLower.includes("smartphone")) return ProductCategory.SMARTPHONE;
    if (nameLower.includes("laptop") || nameLower.includes("notebook")) return ProductCategory.LAPTOP;
    if (nameLower.includes("tablet") || nameLower.includes("ipad")) return ProductCategory.TABLET;
    if (nameLower.includes("headphone") || nameLower.includes("earphone") || nameLower.includes("speaker")) return ProductCategory.AUDIO;
    if (nameLower.includes("watch")) return ProductCategory.SMARTWATCH;
    if (nameLower.includes("shirt") || nameLower.includes("dress") || nameLower.includes("pants") || nameLower.includes("apparel")) return ProductCategory.APPAREL;
    if (nameLower.includes("shoe") || nameLower.includes("sneaker") || nameLower.includes("boot")) return ProductCategory.FOOTWEAR;
    if (nameLower.includes("lipstick") || nameLower.includes("mascara") || nameLower.includes("foundation")) return ProductCategory.MAKEUP;
    if (nameLower.includes("cream") || nameLower.includes("serum") || nameLower.includes("moisturizer")) return ProductCategory.SKINCARE;
    if (nameLower.includes("camera")) return ProductCategory.CAMERA;
  }

  // Last resort: return a generic category (should rarely happen)
  return ProductCategory.APPAREL; // Neutral default
}

/**
 * Get umbrella category for related items
 * E.g., "Smartwatch" and "Audio" are both wearables/personal tech
 */
export function getUmbrellaCategory(category: ProductCategory): string {
  const umbrellaMap: Record<ProductCategory, string> = {
    // ELECTRONICS
    [ProductCategory.SMARTPHONE]: "Personal Technology",
    [ProductCategory.LAPTOP]: "Computing",
    [ProductCategory.TABLET]: "Computing",
    [ProductCategory.CAMERA]: "Photography",
    [ProductCategory.GAMING_CONSOLE]: "Gaming",
    [ProductCategory.AUDIO]: "Personal Audio",
    [ProductCategory.SMARTWATCH]: "Wearables",
    [ProductCategory.MONITOR]: "Computing",
    [ProductCategory.POWER_BANK]: "Accessories",
    
    // FASHION
    [ProductCategory.APPAREL]: "Fashion",
    [ProductCategory.FOOTWEAR]: "Fashion",
    [ProductCategory.BAGS]: "Fashion Accessories",
    [ProductCategory.ACCESSORIES]: "Fashion Accessories",
    [ProductCategory.JEWELRY]: "Fashion Accessories",
    [ProductCategory.WATCHES]: "Fashion Accessories",
    
    // BEAUTY & PERSONAL CARE
    [ProductCategory.SKINCARE]: "Personal Care",
    [ProductCategory.MAKEUP]: "Personal Care",
    [ProductCategory.HAIRCARE]: "Personal Care",
    [ProductCategory.FRAGRANCES]: "Personal Care",
    [ProductCategory.PERSONAL_CARE]: "Personal Care",
    
    // HOME & LIVING
    [ProductCategory.HOME_DECOR]: "Home & Living",
    [ProductCategory.KITCHEN]: "Home & Living",
    [ProductCategory.FURNITURE]: "Home & Living",
    [ProductCategory.BEDDING]: "Home & Living",
    [ProductCategory.CLEANING_SUPPLIES]: "Home & Living",
    
    // SPORTS & OUTDOOR
    [ProductCategory.SPORTS]: "Active Lifestyle",
    [ProductCategory.OUTDOOR]: "Active Lifestyle",
    [ProductCategory.FITNESS_EQUIPMENT]: "Active Lifestyle",
    
    // FOOD & BEVERAGES
    [ProductCategory.GROCERIES]: "Food & Beverages",
    [ProductCategory.SNACKS_SWEETS]: "Food & Beverages",
    [ProductCategory.BEVERAGES]: "Food & Beverages",
    [ProductCategory.COFFEE_TEA]: "Food & Beverages",
    [ProductCategory.SPECIALTY_FOOD]: "Food & Beverages",
    
    // BABY & KIDS
    [ProductCategory.BABY_CARE]: "Baby & Kids",
    [ProductCategory.BABY_TOYS]: "Baby & Kids",
    [ProductCategory.KIDS_APPAREL]: "Baby & Kids",
    
    // PET CARE
    [ProductCategory.PET_FOOD]: "Pet Care",
    [ProductCategory.PET_TOYS]: "Pet Care",
    [ProductCategory.PET_CARE_PRODUCTS]: "Pet Care",
    [ProductCategory.PET_FURNITURE]: "Pet Care",
    
    // HEALTH & WELLNESS
    [ProductCategory.HEALTH_DEVICES]: "Health & Wellness",
    [ProductCategory.VITAMINS_SUPPLEMENTS]: "Health & Wellness",
    
    // BOOKS & MEDIA
    [ProductCategory.BOOKS]: "Media & Entertainment",
    [ProductCategory.MOVIES_MUSIC]: "Media & Entertainment",
    
    // TOOLS & HARDWARE
    [ProductCategory.TOOLS]: "Tools & Hardware",
    [ProductCategory.POWER_TOOLS]: "Tools & Hardware",
    
    // OFFICE & STATIONERY
    [ProductCategory.OFFICE_SUPPLIES]: "Office & Stationery",
  };
  return umbrellaMap[category];
}
