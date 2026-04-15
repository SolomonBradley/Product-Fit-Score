import pg from "pg";

const { Client } = pg;

async function createDatabase() {
  const client = new Client({
    user: "postgres",
    password: "postgres",
    host: "localhost",
    port: 5432,
    database: "postgres", // Connect to default postgres db
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    // Check if database exists
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'fitscoredb'",
    );

    if (result.rows.length === 0) {
      console.log("Creating database fitscoredb...");
      await client.query("CREATE DATABASE fitscoredb");
      console.log("✅ Database fitscoredb created successfully");
    } else {
      console.log("✅ Database fitscoredb already exists");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDatabase();
