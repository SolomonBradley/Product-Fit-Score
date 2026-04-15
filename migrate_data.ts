
import { db, usersTable, profilesTable } from "./lib/db/src/index.ts";
import { eq } from "drizzle-orm";

async function migrate() {
  const emails = ["varshasudhakar22@gmail.com", "2000rsvarsha@gmail.com"];
  
  for (const email of emails) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user) {
      console.log(`User ${email} not found.`);
      continue;
    }

    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, user.id));
    if (!profile) {
      console.log(`Profile for ${email} not found.`);
      continue;
    }

    const oldInt = profile.emailIntegration as any;
    
    // Transform old structure: { brands: string[], recentOrders: string[] }
    // To new structure: { brands: { name, count, source }[], recentOrders: { product, source, count }[] }
    
    if (oldInt && Array.isArray(oldInt.brands) && typeof oldInt.brands[0] === "string") {
       const newBrands = oldInt.brands.map((b: string) => ({ name: b, count: 1, source: "Amazon" }));
       const newOrders = (oldInt.recentOrders || []).map((o: string) => ({ product: o, source: "Amazon", count: 1 }));
       
       await db.update(profilesTable)
         .set({ 
           emailIntegration: { 
             ...oldInt, 
             brands: newBrands, 
             recentOrders: newOrders 
           } as any 
         })
         .where(eq(profilesTable.userId, user.id));
       
       console.log(`Migrated ${email} successfully!`);
    } else {
       console.log(`${email} already migrated or no brands found.`);
    }
  }
}

migrate().catch(console.error);
