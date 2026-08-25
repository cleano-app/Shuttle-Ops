import { Client } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

config({ path: join(__dirname, "..", ".env.local") });

// DATABASE_URL (the direct-connection string from Supabase's dashboard ->
// Connect page) takes priority when set - it needs no region guessing.
// Falls back to constructing a session-pooler URL, whose hostname is
// region-specific and NOT guessable from the project URL alone; override
// SUPABASE_POOLER_HOST if the fallback's assumed region is wrong for this
// project.
let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!
    .replace("https://", "")
    .replace(".supabase.co", "");
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const poolerHost =
    process.env.SUPABASE_POOLER_HOST ?? "aws-1-eu-west-2.pooler.supabase.com";
  connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(
    password
  )}@${poolerHost}:6543/postgres`;
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  // This table lives in the public schema, so PostgREST auto-exposes it to
  // the anon key like any other public table - without RLS, anyone with the
  // project URL could read the full migration history or write/delete rows
  // in it (Supabase's linter flags this as rls_disabled_in_public). It's
  // never queried through PostgREST - only this script, over a direct
  // Postgres connection - so enabling RLS with zero policies (default deny)
  // fully locks out the API without affecting migrations. Runs on every
  // invocation, not just first bootstrap, so it also closes the gap on a
  // table that already existed before this line was added.
  await client.query(`
    alter table if exists schema_migrations enable row level security;
  `);

  const dir = join(__dirname, "..", "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await client.query<{ filename: string }>(
    "select filename from schema_migrations"
  );
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    console.log(`apply ${file}`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (filename) values ($1)",
        [file]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }

  await client.end();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
