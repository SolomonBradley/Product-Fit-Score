import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, profilesTable, analysesTable } from "@workspace/db";
import { AnalyzeProductBody, BoostScoreBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { analyzeProductForUser, recalculateFitScoreForUser, type MasterIntelligence, type UserContext } from "../lib/fitEngine";
import type { Request } from "express";
import type { User } from "@workspace/db";

type AuthRequest = Request & { user: User };

interface EmailIntegration {
  connected?: boolean;
  categories?: string[];
  brands?: Array<{ name: string; count: number; source: string }>;
  recentOrders?: Array<{ product: string; source: string; count: number }>;
}

const router: IRouter = Router();

router.post("/score/analyze", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;
  const parsed = AnalyzeProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id));

  const userContext: UserContext = {
    interests: (profile?.interests as string[]) ?? [],
    emailCategories: ((profile?.emailIntegration as EmailIntegration)?.categories ?? []) as string[],
    emailBrands: ((profile?.emailIntegration as EmailIntegration)?.brands ?? []) as Array<{ name: string; count: number; source: string }>,
    gender: profile?.gender ?? "",
    recentOrders: ((profile?.emailIntegration as EmailIntegration)?.recentOrders ?? []) as Array<{ product: string; source: string; count: number }>,
  };

  logger.info({ 
    orders_count: userContext.recentOrders.length,
    top_orders: userContext.recentOrders.slice(0, 10).map((o: { count: number; product: string; source: string }) => `(${o.count}x, ${o.product}, ${o.source})`),
    brands: userContext.emailBrands.map((b: { name: string; count: number; source: string }) => `(${b.count}x, ${b.name}, ${b.source})`).slice(0, 5)
  }, "[System] Feasting on user Gmail data for intelligence...");

  try {
    const result = await analyzeProductForUser(url, userContext);

    await db.insert(analysesTable).values({
      userId: user.id,
      productName: result.productName,
      productUrl: result.productUrl,
      category: result.category,
      fitScore: result.fitScore,
      result: result as unknown as Record<string, unknown>,
    });

    res.json(result);
  } catch (err: any) {
    logger.error({ err, stack: err.stack }, "[Gmail Sync DEBUG] 500 Analysis Failure");
    res.status(500).json({ error: "Intelligence analysis failed. Check terminal for details." });
  }
});

router.post("/score/boost", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;
  const parsed = BoostScoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productUrl, boostedFeature } = parsed.data;

  const [existingAnalysis] = await db
    .select()
    .from(analysesTable)
    .where(and(
      eq(analysesTable.userId, user.id),
      eq(analysesTable.productUrl, productUrl)
    ))
    .orderBy(desc(analysesTable.analyzedAt))
    .limit(1);

  if (!existingAnalysis) {
    res.status(404).json({ error: "Previous analysis not found." });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id));

  const userContext = {
    interests: (profile?.interests as string[]) ?? [],
    emailCategories: (profile?.emailIntegration as any)?.categories ?? [],
    emailBrands: (profile?.emailIntegration as any)?.brands ?? [],
    gender: profile?.gender ?? "",
    recentOrders: (profile?.emailIntegration as any)?.recentOrders ?? [],
  };

  const base = existingAnalysis.result as unknown as MasterIntelligence;
  const recalculated = await recalculateFitScoreForUser(base, userContext, boostedFeature, {
    fitScore: existingAnalysis.fitScore,
    whyItFitsYou: base.whyItFitsYou,
    whyItMayNot: base.whyItMayNot
  });

  if (!recalculated) {
    res.status(500).json({ error: "Boost failed." });
    return;
  }

  const result = { ...base, ...recalculated, productUrl, analyzedAt: new Date().toISOString() };

  // Update User Preference Knowledge (BUCKET LIMIT: Max 2 boosts per category)
  if (profile) {
    const categoryBucket = result.category;
    const interests = (profile.interests || []) as string[];
    // Case-insensitive match so "Bags & Luggage" === "bags & luggage"
    const currentCategoryBoosts = interests.filter(i => {
      if (!i.startsWith("Prioritizes ")) return false;
      const fm = i.match(/for (.+)$/i);
      return fm ? fm[1].trim().toLowerCase() === categoryBucket.toLowerCase().trim() : false;
    });

    if (currentCategoryBoosts.length < 2) {
      const pref = `Prioritizes ${boostedFeature} for ${categoryBucket}`;
      // Don't add duplicate (case-insensitive)
      const alreadyExists = interests.some(i => i.toLowerCase() === pref.toLowerCase());
      if (!alreadyExists) {
        await db.update(profilesTable).set({ interests: [...interests, pref] }).where(eq(profilesTable.userId, user.id));
      }
    } else {
      logger.info({ categoryBucket, currentCategoryBoosts }, "[Boost] Max 2 boosts reached for this category. Not saving.");
    }
  }

  await db.update(analysesTable)
    .set({ fitScore: result.fitScore, result: result as any })
    .where(eq(analysesTable.id, existingAnalysis.id));

  res.json(result);
});

export default router;
