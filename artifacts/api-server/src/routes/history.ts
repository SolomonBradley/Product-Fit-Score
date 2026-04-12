import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, analysesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import type { Request } from "express";
import type { User } from "@workspace/db";

type AuthRequest = Request & { user: User };

const router: IRouter = Router();

router.get("/history", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;

  const rows = await db
    .select({
      id: analysesTable.id,
      productName: analysesTable.productName,
      productUrl: analysesTable.productUrl,
      category: analysesTable.category,
      fitScore: analysesTable.fitScore,
      riskLevel: analysesTable.riskLevel,
      analyzedAt: analysesTable.analyzedAt,
    })
    .from(analysesTable)
    .where(eq(analysesTable.userId, user.id))
    .orderBy(desc(analysesTable.analyzedAt))
    .limit(20);

  res.json(
    rows.map((r) => ({
      id: r.id,
      productName: r.productName,
      productUrl: r.productUrl,
      category: r.category,
      fitScore: r.fitScore,
      riskLevel: r.riskLevel,
      analyzedAt: r.analyzedAt.toISOString(),
    }))
  );
});

router.get("/history/stats", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;

  const rows = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.userId, user.id));

  if (rows.length === 0) {
    res.json({
      totalAnalyzed: 0,
      averageFitScore: 0,
      topCategory: null,
      categoryBreakdown: {},
      recentHighScore: null,
    });
    return;
  }

  const totalAnalyzed = rows.length;
  const averageFitScore = Math.round(rows.reduce((sum, r) => sum + r.fitScore, 0) / totalAnalyzed);
  const recentHighScore = Math.max(...rows.map((r) => r.fitScore));

  // Category breakdown
  const categoryBreakdown: Record<string, number> = {};
  for (const row of rows) {
    categoryBreakdown[row.category] = (categoryBreakdown[row.category] ?? 0) + 1;
  }
  const topCategory = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  res.json({
    totalAnalyzed,
    averageFitScore,
    topCategory,
    categoryBreakdown,
    recentHighScore,
  });
});

export default router;
