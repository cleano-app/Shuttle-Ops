"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/shell/AuthCard";
import { INPUT_CLASS, LABEL_CLASS, buttonClasses } from "@/components/ui/classes";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push("/login");
  }

  return (
    <AuthCard>
      <form onSubmit={handleSubmit}>
        <h1 className="mb-6 text-xl font-semibold text-navy">Set a new password</h1>

        <label htmlFor="new-password" className={LABEL_CLASS}>
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mb-4 ${INPUT_CLASS}`}
        />

        {error && <p className="mb-4 text-sm text-red">{error}</p>}

        <button type="submit" disabled={pending} className={buttonClasses("primary")}>
          {pending ? "Saving..." : "Save password"}
        </button>
      </form>
    </AuthCard>
  );
}
