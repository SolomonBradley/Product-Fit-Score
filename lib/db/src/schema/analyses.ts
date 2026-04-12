import { pgTable, text, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const analysesTable = pgTable("analyses", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("user_id").notNull(),
  productName: text("product_name").notNull(),
  productUrl: text("product_url").notNull(),
  category: text("category").notNull(),
  fitScore: real("fit_score").notNull(),
  riskLevel: text("risk_level").notNull(),
  result: jsonb("result").notNull(),
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
});

export type Analysis = typeof analysesTable.$inferSelect;
export type InsertAnalysis = typeof analysesTable.$inferInsert;
