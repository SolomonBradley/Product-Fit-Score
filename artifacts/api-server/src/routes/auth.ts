import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, sessionsTable, profilesTable } from "@workspace/db";
import {
  SignupBody,
  LoginBody,
} from "@workspace/api-zod";
import {
  hashPassword,
  verifyPassword,
  generateUserId,
  createSession,
  getUserFromToken,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const id = generateUserId();
  const passwordHash = hashPassword(password);

  await db.insert(usersTable).values({ id, email, passwordHash, name, onboardingCompleted: false });

  const token = await createSession(id);

  res.status(201).json({
    user: { id, email, name, onboardingCompleted: false },
    token,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const { valid, needsMigration } = verifyPassword(password, user.passwordHash);

  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Auto-migrate SHA256 passwords to scrypt if needed
  if (needsMigration) {
    const newHash = hashPassword(password);
    await db
      .update(usersTable)
      .set({ passwordHash: newHash })
      .where(eq(usersTable.id, user.id))
      .catch(() => {}); // Silent fail if update fails
  }

  const token = await createSession(user.id);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      onboardingCompleted: user.onboardingCompleted,
    },
    token,
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.json({ success: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      onboardingCompleted: user.onboardingCompleted,
    },
    token,
  });
});

export default router;
