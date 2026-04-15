import { db, profilesTable } from "./lib/db/src/index.js";
import { eq } from "drizzle-orm";

async function check() {
  const all = await db.select().from(profilesTable);
  console.log(JSON.stringify(all, null, 2));
  process.exit(0);
}

check().catch(console.error);
