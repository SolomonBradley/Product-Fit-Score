import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, profilesTable } from "@workspace/db";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import type { Request } from "express";
import type { User } from "@workspace/db";

type AuthRequest = Request & { user: User };

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id));

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json({
    userId: profile.userId,
    name: profile.name,
    gender: profile.gender,
    height: profile.height ?? null,
    weight: profile.weight ?? null,
    apparel: profile.apparel,
    arMeasurements: profile.arMeasurements,
    interests: profile.interests,
    emailIntegration: profile.emailIntegration,
  });
});

router.put("/profile", requireAuth, async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  const upsertData = {
    userId: user.id,
    name: data.name,
    gender: data.gender,
    height: data.height ?? null,
    weight: data.weight ?? null,
    apparel: data.apparel as Record<string, unknown>,
    arMeasurements: data.arMeasurements as Record<string, unknown>,
    interests: data.interests as string[],
    emailIntegration: data.emailIntegration as Record<string, unknown>,
    updatedAt: new Date(),
  };

  const [profile] = await db
    .insert(profilesTable)
    .values(upsertData)
    .onConflictDoUpdate({
      target: profilesTable.userId,
      set: {
        name: upsertData.name,
        gender: upsertData.gender,
        height: upsertData.height,
        weight: upsertData.weight,
        apparel: upsertData.apparel,
        arMeasurements: upsertData.arMeasurements,
        interests: upsertData.interests,
        emailIntegration: upsertData.emailIntegration,
        updatedAt: upsertData.updatedAt,
      },
    })
    .returning();

  // Mark onboarding completed
  await db
    .update(usersTable)
    .set({ onboardingCompleted: true })
    .where(eq(usersTable.id, user.id));

  res.json({
    userId: profile.userId,
    name: profile.name,
    gender: profile.gender,
    height: profile.height ?? null,
    weight: profile.weight ?? null,
    apparel: profile.apparel,
    arMeasurements: profile.arMeasurements,
    interests: profile.interests,
    emailIntegration: profile.emailIntegration,
  });
});

export default router;
