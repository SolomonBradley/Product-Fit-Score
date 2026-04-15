import crypto from "crypto";
import { scryptSync, randomBytes } from "crypto";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import pino from "pino";

const logger = pino();

/**
 * 🔒 SECURITY FIX: Migrated from SHA256 (weak) to scrypt (strong password hashing)
 * 
 * Why: SHA256 is not a password hashing algorithm - it's cryptographic hash.
 * Rainbow tables can crack SHA256 in minutes. Scrypt uses proper salting + iteration.
 * 
 * Migration Strategy: Automatic on user login (transparent to users)
 * - Old SHA256 hashes still validated during login
 * - When user logs in, password auto-upgraded to scrypt
 * - After 2-3 weeks, all users migrated
 */

/**
 * Check if hash is in old SHA256 format (64 hex characters)
 */
export function isSHA256Hash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}

/**
 * Hash password using scrypt (new standard)
 * Format: $scrypt$N=16384$salt$hash
 */
export function hashPassword(password: string): string {
  const N = 16384; // CPU/memory cost parameter
  const r = 8;     // block size parameter
  const p = 1;     // parallelization parameter
  const salt = randomBytes(16).toString("hex");
  
  const hash = scryptSync(password, salt, 64, { N, r, p }).toString("hex");
  return `$scrypt$N=${N}$${salt}$${hash}`;
}

/**
 * Verify password against stored hash
 * Handles both old SHA256 and new scrypt formats during migration
 */
export function verifyPassword(
  password: string,
  storedHash: string
): { valid: boolean; needsMigration: boolean } {
  // Check if old SHA256 format
  if (isSHA256Hash(storedHash)) {
    // For backward compatibility, still validate against SHA256
    const sha256Hash = crypto.createHash("sha256").update(password + "fit-score-salt").digest("hex");
    const isValid = crypto.timingSafeEqual(
      Buffer.from(sha256Hash),
      Buffer.from(storedHash)
    ) ? true : false;

    if (isValid) {
      logger.debug("SHA256 password matched - will migrate to scrypt on this login");
    }

    return {
      valid: isValid,
      needsMigration: isValid, // Mark for upgrade if valid
    };
  }

  // New format: use scrypt
  if (storedHash.startsWith("$scrypt$")) {
    try {
      const parts = storedHash.split("$");
      const params = parts[2]; // "N=16384"
      const salt = parts[3];
      const storedHashValue = parts[4];
      
      const N = parseInt(params.split("=")[1]);
      const computedHash = scryptSync(password, salt, 64, { N, r: 8, p: 1 }).toString("hex");
      
      const valid = crypto.timingSafeEqual(
        Buffer.from(computedHash),
        Buffer.from(storedHashValue)
      ) ? true : false;

      return {
        valid,
        needsMigration: false, // Already scrypt
      };
    } catch (err) {
      logger.error(err, "Error verifying scrypt hash");
      return { valid: false, needsMigration: false };
    }
  }

  logger.warn("Unknown hash format in database");
  return { valid: false, needsMigration: false };
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateUserId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await db.insert(sessionsTable).values({ token, userId, expiresAt });
  return token;
}

export async function getUserFromToken(token: string) {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, token));

  if (!session || session.expiresAt < new Date()) return null;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId));

  return user || null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  (req as Request & { user: typeof user }).user = user;
  next();
}

