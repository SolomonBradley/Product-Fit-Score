import { pgTable, text, real, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";

export const profilesTable = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  gender: text("gender").notNull().default(""),
  height: real("height"),
  weight: real("weight"),
  apparel: jsonb("apparel").notNull().default({ topSize: "M", bottomSize: "32" }),
  arMeasurements: jsonb("ar_measurements").notNull().default({ chest: null, waist: null, hips: null, inseam: null }),
  interests: jsonb("interests").notNull().default([]),
  emailIntegration: jsonb("email_integration").notNull().default({ connected: false, categories: [], brands: [] }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Profile = typeof profilesTable.$inferSelect;
export type InsertProfile = typeof profilesTable.$inferInsert;
