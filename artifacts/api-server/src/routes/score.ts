import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable, analysesTable } from "@workspace/db";
import { AnalyzeProductBody, BoostScoreBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { analyzeProductForUser } from "../lib/fitEngine";
import type { Request } from "express";
import type { User } from "@workspace/db";

type AuthRequest = Request & { user: User };

const router: IRouter = Router();

router.post("/score/analyze", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;
  const parsed = AnalyzeProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url, boostedFeatures } = parsed.data;

  // Get user profile for personalization
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id));

  const userContext = {
    interests: (profile?.interests as string[]) ?? [],
    emailCategories: (profile?.emailIntegration as { categories?: string[] })?.categories ?? [],
    emailBrands: (profile?.emailIntegration as { brands?: string[] })?.brands ?? [],
    gender: profile?.gender ?? "",
  };

  const result = analyzeProductForUser(url, userContext, boostedFeatures ?? []);

  // Store in history
  await db.insert(analysesTable).values({
    userId: user.id,
    productName: result.productName,
    productUrl: result.productUrl,
    category: result.category,
    fitScore: result.fitScore,
    riskLevel: result.riskLevel,
    result: result as unknown as Record<string, unknown>,
  });

  res.json(result);
});

router.post("/score/boost", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;
  const parsed = BoostScoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productUrl, boostedFeature } = parsed.data;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id));

  const userContext = {
    interests: (profile?.interests as string[]) ?? [],
    emailCategories: (profile?.emailIntegration as { categories?: string[] })?.categories ?? [],
    emailBrands: (profile?.emailIntegration as { brands?: string[] })?.brands ?? [],
    gender: profile?.gender ?? "",
  };

  const result = analyzeProductForUser(productUrl, userContext, [boostedFeature]);

  // Update the latest history entry for this URL
  const existing = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.userId, user.id))
    .orderBy(analysesTable.analyzedAt);

  const latestForUrl = existing.filter((a) => a.productUrl === productUrl).pop();
  if (latestForUrl) {
    await db
      .update(analysesTable)
      .set({
        fitScore: result.fitScore,
        riskLevel: result.riskLevel,
        result: result as unknown as Record<string, unknown>,
      })
      .where(eq(analysesTable.id, latestForUrl.id));
  }

  res.json(result);
});

export default router;
