// The four built-in dev/QA logins (admin/office/dispatcher/driver
// @shuttleops.dev, created by seed-users.ts) have their passwords in this
// repo. On the live project they stay switched OFF; turn one on only for a
// test session, then off again.
//
//   npm run setup-accounts -- off            ban all four (default)
//   npm run setup-accounts -- on office      allow one again
//   npm run setup-accounts -- status
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "path";

config({ path: join(__dirname, "..", ".env.local") });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROLES = ["admin", "office", "dispatcher", "driver"];

async function main() {
  const [mode = "status", only] = process.argv.slice(2);
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const targets = data.users.filter((u) => {
    const local = u.email?.toLowerCase().match(/^([a-z]+)@shuttleops\.dev$/)?.[1];
    return local && ROLES.includes(local) && (!only || local === only);
  });
  for (const u of targets) {
    if (mode === "off" || mode === "on") {
      const { error: e } = await admin.auth.admin.updateUserById(u.id, {
        ban_duration: mode === "off" ? "876000h" : "none",
      });
      if (e) throw e;
    }
    const { data: fresh } = await admin.auth.admin.getUserById(u.id);
    const banned = fresh.user?.banned_until && new Date(fresh.user.banned_until) > new Date();
    console.log(`${u.email}: ${banned ? "OFF" : "ON"}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
