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
    res.json({
      userId: user.id,
      name: user.name || "",
      gender: "prefer_not_to_say",
      height: null,
      weight: null,
      apparel: { topSize: "M", bottomSize: "32" },
      arMeasurements: { chest: null, waist: null, hips: null, inseam: null },
      interests: [],
      emailIntegration: { connected: false, categories: [], brands: [] },
    });
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

  // Fetch existing profile to protect system-managed fields (like emailIntegration) from being overwritten by the frontend
  const [existingProfile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, user.id));

  const upsertData = {
    userId: user.id,
    name: data.name,
    gender: data.gender,
    height: data.height ?? null,
    weight: data.weight ?? null,
    apparel: data.apparel as Record<string, unknown>,
    arMeasurements: data.arMeasurements as Record<string, unknown>,
    interests: data.interests as string[],
    // STRICT PRESERVATION: Do not let the frontend wipe out Gmail sync data
    emailIntegration: existingProfile 
        ? existingProfile.emailIntegration 
        : { connected: false, categories: [], brands: [] },
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
        // CRITICAL: Do NOT overwrite emailIntegration on conflict, preserve the DB version
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
