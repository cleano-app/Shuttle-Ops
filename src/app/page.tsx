import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();

  // redirect() throws internally - the `return` is defensive style, matching
  // Cleano Ops's root page.tsx.
  if (!session) return redirect("/login");
  if (session.role === "driver") return redirect("/driver");
  return redirect("/office/dashboard");
}
