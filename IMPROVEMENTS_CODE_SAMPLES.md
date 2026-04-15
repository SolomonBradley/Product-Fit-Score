# 🔧 IMPROVEMENTS — DETAILED CODE CHANGES

## SAFE FIXES (Ready to Apply ✅)

### 1. app.ts — CORS Origin Restriction
```typescript
// BEFORE:
app.use(cors());

// AFTER:
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
```

---

### 2. app.ts — Reorder Middleware (CORS before Logger)
```typescript
// BEFORE:
app.use(pinoHttp({ ... }));
app.use(cors());
app.use(express.json());

// AFTER:
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(pinoHttp({ ... }));
app.use(express.json());
```

---

### 3. app.ts — Add Global Error Handler
```typescript
// ADD THIS BEFORE: app.listen()

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, stack: err?.stack }, "Unhandled error in request");
  res.status(500).json({ error: "Internal server error" });
});
```

---

### 4. history.ts — Query Optimization
```typescript
// BEFORE (at /history endpoint):
const rows = await db
  .select()
  .from(analysesTable)
  .where(eq(analysesTable.userId, user.id))
  .orderBy(desc(analysesTable.analyzedAt))
  .limit(20);

// AFTER: (Select only needed columns, not full JSONB)
const rows = await db
  .select({
    id: analysesTable.id,
    productName: analysesTable.productName,
    productUrl: analysesTable.productUrl,
    category: analysesTable.category,
    fitScore: analysesTable.fitScore,
    analyzedAt: analysesTable.analyzedAt,
  })
  .from(analysesTable)
  .where(eq(analysesTable.userId, user.id))
  .orderBy(desc(analysesTable.analyzedAt))
  .limit(20);
```

---

### 5. ollamaClient.ts — Timeout Cleanup Fix
```typescript
// BEFORE:
for (let attempt = 0; attempt <= retries; attempt++) {
  try {
    const chatPromise = client.chat({ ... });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM request timeout (10 min)")), 600000)
    );
    const response = await Promise.race([chatPromise, timeoutPromise]);
    clearTimeout(timeout); // ← Only clears on success
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (attempt < retries) {
      continue; // ← Skips clearTimeout on retry!
    }
    clearTimeout(timeout);
    logger.error(...);
  }
}

// AFTER: (use finally block)
for (let attempt = 0; attempt <= retries; attempt++) {
  const timeoutId = setTimeout(() => {...}, 600000);
  try {
    const response = await Promise.race([chatPromise, timeoutPromise]);
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (attempt < retries) {
      continue;
    }
    logger.error(...);
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

## MODERATE RISK FIXES (Needs Testing ⚠️)

### 6. auth.ts — Email Normalization
```typescript
// BEFORE: /auth/signup
const { email, password, name } = parsed.data;
const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));

// AFTER: (Normalize email)
const email = parsed.data.email.toLowerCase().trim();
const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));

// SAME CHANGE in /auth/login:
const email = parsed.data.email.toLowerCase().trim();
const passwordHash = hashPassword(password);
const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
```

**Migration Script Needed:**
```sql
-- Run this once to normalize existing emails
UPDATE users SET email = LOWER(email) WHERE email != LOWER(email);
-- Identify any accidental duplicates (if case mismatch existed)
SELECT email, COUNT(*) FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1;
```

---

### 7. auth.ts — Timing-Safe Comparison
```typescript
// BEFORE: /auth/login
if (!user || user.passwordHash !== passwordHash) {
  res.status(401).json({ error: "Invalid email or password" });
  return;
}

// AFTER: (Use timing-safe comparison)
import crypto from "crypto";

if (!user) {
  res.status(401).json({ error: "Invalid email or password" });
  return;
}

try {
  if (!crypto.timingSafeEqual(
    Buffer.from(user.passwordHash),
    Buffer.from(passwordHash)
  )) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
} catch (err) {
  // Hashes are different lengths (shouldn't happen with same algorithm)
  res.status(401).json({ error: "Invalid email or password" });
  return;
}
```

---

### 8. gmail.ts — Domain-Specific Blocklist
```typescript
// BEFORE: (Matches "google" anywhere in email)
const NON_PURCHASE_DOMAINS = [
  "udemy", "coursera", "google", "microsoft", ...
];
const fromLowerCheck = from.toLowerCase();
const isBlocklisted = NON_PURCHASE_DOMAINS.some(domain => fromLowerCheck.includes(domain));

// AFTER: (Match only @domain.com pattern)
const NON_PURCHASE_DOMAINS = [
  "@udemy.com", "@coursera.com", "@google.com", "@microsoft.com", ...
];
const fromLowerCheck = from.toLowerCase();
const isBlocklisted = NON_PURCHASE_DOMAINS.some(domain => fromLowerCheck.includes(domain));
```

---

## HIGH RISK FIXES (Needs Approval ❌)

### 9. score.ts — Analysis Deduplication (24h Cache)
```typescript
// ADD THIS in POST /score/analyze, BEFORE calling analyzeProductForUser()

// 💾 Check for recent analysis (same user, same URL, within 24h)
const [recentAnalysis] = await db
  .select()
  .from(analysesTable)
  .where(and(
    eq(analysesTable.userId, user.id),
    eq(analysesTable.productUrl, productUrl),
    gt(analysesTable.analyzedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
  ))
  .orderBy(desc(analysesTable.analyzedAt))
  .limit(1);

if (recentAnalysis) {
  logger.info({ productUrl }, "[Score] Returning cached analysis from 24h");
  return res.json({
    ...recentAnalysis.result,
    cached: true,
    cachedAt: recentAnalysis.analyzedAt.toISOString(),
  });
}

// ... existing analysis code ...
```

**UI Changes Required:**
- Add badge "Cached (from 2h ago)" on FitScoreCard
- Add refresh button to force new analysis
- Document cache behavior in API schema

---

### 10. fitEngine.ts — Strict Category Enum
```typescript
// In analyzeProduct() LLM prompt, change the schema hint:

// BEFORE:
"category": "Smartphones, Laptops, Electronics & Accessories, Apparel, Footwear, Bags & Luggage, Audio, Cameras & Photography, Gaming, Skincare & Beauty, Home, Kitchen & Decor",

// AFTER: (Strict enum — LLM must return one of these exactly)
"category": "Smartphones|Laptops|Electronics|Apparel|Footwear|Bags|Audio|Cameras|Gaming|Skincare|Home|Kitchen",

// ADD JSON schema constraint:
"$schema": "http://json-schema.org/draft-07/schema#",
"properties": {
  "category": {
    "type": "string",
    "enum": ["Smartphones", "Laptops", "Electronics", "Apparel", "Footwear", "Bags", "Audio", "Cameras", "Gaming", "Skincare", "Home", "Kitchen"]
  }
}
```

**Testing Required:**
```
Test URLs:
1. Amazon phone: https://www.amazon.in/dp/B0XXXXX (expect: "Smartphones")
2. Flipkart shirt: https://www.flipkart.com/shirt (expect: "Apparel")
3. Myntra shoes: https://www.myntra.com/shoes (expect: "Footwear")
4. Edge case: Food/travel items (expect: fallback or "Unknown")
```

---

### 11. fitEngine.ts — Multi-Site Breadcrumb Extraction
```typescript
// In cleanPageContent(), add site detection:

function cleanPageContent(html: string, url: string): string {
  // BEFORE: Amazon-specific selectors only
  const breadcrumbMatch = html.match(/<div[^>]*id="wayfinding-breadcrumbs_container"[^>]*>([\s\S]*?)<\/div>/i);
  
  // AFTER: Multi-site support
  let breadcrumbs = "Unknown Category";
  
  // Detect site
  if (url.includes("amazon")) {
    const match = html.match(/<div[^>]*id="wayfinding-breadcrumbs_container"[^>]*>([\s\S]*?)<\/div>/i);
    if (match) breadcrumbs = match[1].replace(/<[^>]+>/g, " ").split(/[›>]/).pop()?.trim() || "Unknown";
  } else if (url.includes("flipkart")) {
    const match = html.match(/<div[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (match) breadcrumbs = match[1].replace(/<[^>]+>/g, " ").split(/[›>]/).pop()?.trim() || "Unknown";
  } else if (url.includes("myntra")) {
    const match = html.match(/<nav[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/nav>/i);
    if (match) breadcrumbs = match[1].replace(/<[^>]+>/g, " ").split(/[›>]/).pop()?.trim() || "Unknown";
  } else {
    // Generic fallback
    const match = html.match(/<(?:nav|div)[^>]*(?:class|aria-label)="[^"]*(?:breadcrumb|navigation)[^"]*"[^>]*>([\s\S]*?)<\/(?:nav|div)>/i);
    if (match) breadcrumbs = match[1].replace(/<[^>]+>/g, " ").split(/[›>]/).pop()?.trim() || "Unknown";
  }
  
  const title = ...
  const price = ...
  
  return `CATEGORY: ${breadcrumbs}\nTITLE: ${title}\nPRICE: ${price}\nDETAILS: ${mainText}\nREVIEWS:\n${reviews}`;
}

// Also update function signature:
async function analyzeProduct(html: string, url: string, user: UserContext): Promise<MasterIntelligence | null> {
  const cleaned = cleanPageContent(html, url); // ← Pass URL for site detection
```

**Testing Required:**
```
1. Amazon URL → Category: "Electronics"
2. Flipkart URL → Category: "Apparel"
3. Myntra URL → Category: "Footwear"
4. Generic site → Should either extract or return "Unknown"
```

---

## Summary of Changes

| Fix | Risk | Changes | Testing Needed |
|-----|------|---------|----------------|
| 1. CORS Whitelist | ✅ Low | 1 line | No |
| 2. Middleware order | ✅ Low | 3 lines | No |
| 3. Error handler | ✅ Low | 5 lines | No |
| 4. Query optimization | ✅ Low | 10 lines | No |
| 5. Timeout cleanup | ✅ Low | 5 lines | No |
| 6. Email normalization | ⚠️ Medium | 5 lines + migration | Yes (1 test case) |
| 7. Timing-safe compare | ⚠️ Medium | 10 lines | Yes (2 test cases) |
| 8. Domain blocklist | ⚠️ Medium | 5 lines | Yes (1 test case) |
| 9. Cache deduplication | ❌ High | 15 lines + UI | Yes (multiple test cases) |
| 10. Category enum | ❌ High | 10 lines | Yes (multiple products) |
| 11. Multi-site scraper | ❌ High | 30 lines | Yes (multiple sites) |

---

**Choose which ones you'd like me to apply!** 🎯
