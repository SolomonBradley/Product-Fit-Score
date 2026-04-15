# 20 Strict Product Categories - Reference Guide

## The 20 Categories (ProductCategory Enum)

### Electronics (7 categories)
1. **Smartphones** - Mobile phones, feature phones
   - Features: performance, battery, camera, design, value
   - Brands: Apple, Samsung, OnePlus, Xiaomi, Google Pixel
   
2. **Laptops** - Notebooks, ultrabooks, convertibles
   - Features: performance, battery, display, build_quality, value
   - Brands: Dell, HP, Lenovo, MacBook, ASUS
   
3. **Tablets** - iPads, Android tablets, pen displays
   - Features: performance, battery, display, portability, value
   - Brands: iPad, Samsung Galaxy Tab
   
4. **Cameras** - DSLRs, mirrorless, compact cameras
   - Features: image_quality, lens_quality, durability, ease_of_use, value
   - Brands: Canon, Nikon, Sony, Fujifilm
   
5. **Gaming Consoles** - PlayStation, Xbox, Nintendo
   - Features: performance, game_library, build_quality, design, value
   - Brands: PlayStation, Xbox, Nintendo Switch
   
6. **Audio** - Headphones, earbuds, speakers, earphones
   - Features: sound_quality, comfort, battery, durability, design
   - Brands: Bose, Sony, JBL, Beats, Sennheiser, AirPods, Boat
   
7. **Smartwatches** - Wearable watches, fitness trackers
   - Features: battery, accuracy, design, comfort, features
   - Brands: Apple Watch, Fitbit, Garmin

### Fashion (4 categories)
8. **Apparel** - Shirts, dresses, pants, jackets, coats, kurtas
   - Features: fit, material_quality, comfort, durability, style
   - Brands: Nike, Adidas, Zara, H&M, Myntra, Meesho
   - **SPECIAL:** Size data included for this category
   
9. **Footwear** - Shoes, sneakers, sandals, boots, slippers
   - Features: comfort, durability, style, material_quality, fit
   - Brands: Nike, Adidas, Timberland, Converse, New Balance
   - **SPECIAL:** Size data included for this category
   
10. **Bags** - Handbags, backpacks, luggage, wallets
    - Features: capacity, material_quality, comfort, durability, design
    - Brands: Gucci, Prada, Louis Vuitton, Fossil
    - **SPECIAL:** Size data relevant (capacity, compartments)
    
11. **Accessories** - Belts, scarves, hats, jewelry, sunglasses
    - Features: durability, design, functionality, material_quality, value
    - Brands: (varies by sub-type)

### Beauty (3 categories)
12. **Skincare** - Face creams, serums, masks, moisturizers, cleansers
    - Features: effectiveness, ingredient_quality, skin_compatibility, texture, value
    - Brands: Olay, Neutrogena, Mamaearth, Minimalist, CeraVe
    
13. **Makeup** - Lipstick, mascara, foundation, blush, eyeshadow
    - Features: pigmentation, longevity, texture, shade_range, value
    - Brands: MAC, Maybelline, Lakme, Sephora
    
14. **Haircare** - Shampoo, conditioner, oils, treatments
    - Features: effectiveness, ingredient_quality, scent, texture, value
    - Brands: (varies widely)

### Home & Living (3 categories)
15. **Home Decor** - Wall art, cushions, curtains, rugs, plants
    - Features: design, material_quality, durability, functionality, value
    - Brands: IKEA, Pepperfry
    
16. **Kitchen** - Cookware, utensils, appliances, knives
    - Features: durability, ease_of_use, heat_distribution, material_quality, value
    - Brands: (brand-agnostic)
    
17. **Furniture** - Sofas, beds, tables, chairs, shelves
    - Features: comfort, durability, design, space_efficiency, value
    - Brands: IKEA, Urban Ladder, Pepperfry

### Sports & Fitness (2 categories)
18. **Sports** - Sports equipment, gear, balls, rackets
    - Features: performance, durability, comfort, design, value
    - Brands: Decathlon
    
19. **Fitness Equipment** - Yoga mats, dumbbells, treadmills, resistance bands
    - Features: durability, ease_of_use, performance, safety, value
    - Brands: (brand-agnostic)

---

## How Categories are Detected

The `detectCategory()` function in `categories.ts`:

1. **Brand Matching** (Primary): Checks brand against BRAND_TO_CATEGORY map
   - Example: "Apple iPhone" → checks "apple" → Maps to SMARTPHONE
   
2. **Product Name Keywords** (Fallback): Searches product name for keywords
   - Example: "Samsung Galaxy Watch" → checks for "watch" → Maps to SMARTWATCH
   
3. **Last Resort:** Returns APPAREL as neutral default (should rarely happen)

---

## Size Data Rule

**ONLY these categories get size context passed to LLM:**
- Apparel
- Footwear  
- Accessories (some types)

**ALL OTHER categories:**
- Size data explicitly filtered out
- LLM not given size information
- Prevents confusion (e.g., "fit" for apparel vs. "fit" as in "good value")

---

## Feature Score Template Example

### Smartphones
```typescript
"featureScores": {
  "performance": 7,     // Processor, RAM, speed
  "battery": 8,         // Battery capacity, life
  "camera": 9,          // Sensor quality, low-light performance
  "design": 7,          // Build quality, feel, aesthetics
  "value": 6            // Price-to-performance ratio
}
```

### Apparel
```typescript
"featureScores": {
  "fit": 8,              // How well it fits the body
  "material_quality": 7, // Fabric durability, comfort
  "comfort": 9,          // How comfortable to wear
  "durability": 7,       // How long it lasts
  "style": 8             // Fashion appeal, design
}
```

### Skincare
```typescript
"featureScores": {
  "effectiveness": 7,           // Does it work as claimed
  "ingredient_quality": 8,      // Ingredient transparency, safety
  "skin_compatibility": 6,      // Works for most skin types
  "texture": 8,                 // Feels good on skin
  "value": 5                    // Price vs. results
}
```

---

## Umbrella Categories

When analyzing related products, note these umbrella groupings:

| Umbrella Category | Includes | Note |
|---|---|---|
| Personal Technology | Smartphones, Laptop, Tablet, Audio, Smartwatch | Tech-forward users |
| Computing | Laptops, Tablets | Work/productivity |
| Gaming | Gaming Consoles, Audio | Entertainment |
| Fashion | Apparel, Footwear, Bags, Accessories | Style-conscious |
| Personal Care | Skincare, Makeup, Haircare | Beauty/wellness |
| Home & Living | Home Decor, Kitchen, Furniture | Interior/comfort |
| Active Lifestyle | Sports, Fitness Equipment | Fitness-focused |

---

## Integration Points

### In LLM Prompts
- Category appears in context: `[PRODUCT CATEGORY] Strict Category: Smartphones`
- Umbrella category mentioned: `Umbrella Category: Personal Technology`
- Feature list defined: `Category-Specific Features to Evaluate: performance, battery, camera, design, value`

### In User Context Filtering
- Only interests matching the category are included
- Other categories are explicitly forbidden in prompt
- Relevant orders filtered by category keywords

### In Email Analysis
- Gmail extraction maps sender → brand → category
- Categories aggregated from email purchase history
- Used to infer user preferences

---

## Validation Example

**User Profile Data:**
```json
{
  "emailCategories": ["electronics", "fashion"],
  "emailBrands": [
    ["Apple", 3, "Amazon"],
    ["Nike", 2, "Myntra"],
    ["Adidas", 1, "Flipkart"]
  ],
  "recentOrders": [
    [3, "iPhone Pro", "Amazon"],
    [2, "Nike Shoes", "Myntra"],
    [1, "Adidas Shirt", "Flipkart"]
  ]
}
```

**When analyzing a Smartphone:**
- ✅ Include Apple (electronics/brand match)
- ❌ Filter out Nike (fashion/apparel, different category)
- ✅ Include iPhone orders (electronics/smartphone match)
- ❌ Filter out Adidas Shirt (fashion, different category)

**Result:** Only electronics-relevant data passed to LLM analysis ✨
