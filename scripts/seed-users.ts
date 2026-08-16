import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "path";

config({ path: join(__dirname, "..", ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Placeholder dev domain (shuttleops.dev), distinct from any real Cleano
// credential and from any real production email — see the memory note on
// never touching real login passwords.
const SEED_USERS = [
  {
    email: "admin@shuttleops.dev",
    password: "ShuttleAdmin123!",
    role: "admin" as const,
    display_name: "Admin",
  },
  {
    email: "office@shuttleops.dev",
    password: "ShuttleOffice123!",
    role: "office" as const,
    display_name: "Office One",
  },
  {
    email: "dispatcher@shuttleops.dev",
    password: "ShuttleDispatch123!",
    role: "dispatcher" as const,
    display_name: "Dispatcher One",
  },
  {
    email: "driver@shuttleops.dev",
    password: "ShuttleDriver123!",
    role: "driver" as const,
    display_name: "Driver One",
  },
];

async function main() {
  for (const seed of SEED_USERS) {
    const { data: list } = await admin.auth.admin.listUsers();
    let user = list?.users.find((u) => u.email === seed.email);

    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: seed.email,
        password: seed.password,
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user;
      console.log(`created auth user ${seed.email}`);
    } else {
      console.log(`auth user ${seed.email} already exists`);
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: user!.id,
      role: seed.role,
      display_name: seed.display_name,
    });
    if (profileError) throw profileError;
    console.log(`profile ready: ${seed.email} (${seed.role})`);
  }

  console.log("\nSeeded dev accounts:");
  for (const seed of SEED_USERS) {
    console.log(`  ${seed.role.padEnd(10)} ${seed.email} / ${seed.password}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
