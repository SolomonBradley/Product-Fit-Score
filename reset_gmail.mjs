// One-shot script: resets Gmail integration for ALL user profiles
// Run with: node reset_gmail.mjs
// Reads DATABASE_URL from artifacts/api-server/.env

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;

// Load .env manually
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "artifacts/api-server/.env");
let dbUrl = "postgresql://postgres:postgres@localhost:5432/postgres"; // fallback

try {
  const envContent = readFileSync(envPath, "utf-8");
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    dbUrl = match[1].trim();
    console.log(`📖 Loaded DATABASE_URL from .env`);
  }
} catch {
  console.log("⚠️  Could not read .env file, using default connection string.");
}

console.log(`🔌 Connecting to: ${dbUrl.replace(/:([^:@]+)@/, ":****@")}`); // mask password

const client = new Client({ connectionString: dbUrl });

async function reset() {
  try {
    await client.connect();
    console.log("✅ Connected to database.");

    // Show current state of all profiles
    const before = await client.query(
      `SELECT id, user_id, 
        (email_integration->>'connected')::boolean as connected,
        jsonb_array_length(COALESCE(email_integration->'brands', '[]'::jsonb)) as brand_count,
        jsonb_array_length(COALESCE(email_integration->'recentOrders', '[]'::jsonb)) as order_count
       FROM profiles`
    );

    if (before.rows.length === 0) {
      console.log("⚠️  No profiles found in the database.");
      return;
    }

    console.log(`\n📋 Found ${before.rows.length} profile(s):`);
    for (const row of before.rows) {
      console.log(
        `  Profile ${row.id} | user: ${row.user_id} | connected=${row.connected ?? false} | brands=${row.brand_count} | orders=${row.order_count}`
      );
    }

    // Reset all profiles - clears emailIntegration so they must re-sync
    const result = await client.query(
      "UPDATE profiles SET email_integration = NULL, updated_at = NOW()"
    );
    console.log(
      `\n🔄 Reset complete. ${result.rowCount} profile(s) disconnected from Gmail.`
    );
    console.log("✅ All users must now re-sync Gmail to get fresh data.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.message.includes("password authentication")) {
      console.log(
        "\n💡 Tip: Update the DATABASE_URL in artifacts/api-server/.env with the correct password."
      );
      console.log(
        "   Then run this script again: node reset_gmail.mjs"
      );
    }
    if (err.message.includes("ECONNREFUSED")) {
      console.log(
        "\n💡 Tip: Make sure PostgreSQL is running before running this script."
      );
    }
  } finally {
    await client.end();
  }
}

reset();
