// Creates (or upgrades) a real admin account. Run it yourself:
//   npm run create-admin
// It asks for name, email and password in the terminal; the password is
// hidden while typed and is never written to disk or shown anywhere.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "path";
import * as readline from "readline";

config({ path: join(__dirname, "..", ".env.local") });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.startsWith(question)) out.output.write(question);
      else if (s.includes("\n")) out.output.write("\n");
      else out.output.write("*");
    };
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function main() {
  const name = await ask("Your name: ");
  const email = (await ask("Email: ")).toLowerCase();
  const password = await ask("Password (hidden, min 8 characters): ", true);
  if (!name || !email || password.length < 8) throw new Error("Name, email and an 8+ character password are needed.");

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = list.users.find((u) => u.email?.toLowerCase() === email);

  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw error;
    console.log("Account already existed - password updated.");
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("Could not create the account.");
    user = data.user;
    console.log("Account created.");
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: user.id, role: "admin", display_name: name }, { onConflict: "id" });
  if (profileError) throw profileError;

  console.log(`${email} is an admin. Sign in at https://shuttle-ops.vercel.app/login`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
