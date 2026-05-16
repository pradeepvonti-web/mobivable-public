import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Set new password — Mobivable" },
      { name: "description", content: "Choose a new password for your account." },
    ],
  }),
});

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Z]/.test(pw)) return "Include at least one uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Include at least one lowercase letter.";
  if (!/\d/.test(pw)) return "Include at least one number.";
  return null;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase places the recovery token in the URL fragment; the SDK consumes it
  // automatically and fires a PASSWORD_RECOVERY event. We wait for either that
  // event or an existing session before allowing a password change.
  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setHasRecoverySession(true);
      setReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const v = validatePassword(password);
    if (v) {
      setError(v);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      // Sign out so the user must log in with the new password.
      await supabase.auth.signOut();
      setTimeout(() => navigate({ to: "/login" }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      eyebrow="Account Recovery"
      title="Set a new password"
      intro="Choose a strong password. You'll be signed out and asked to log in again."
    >
      <div className="max-w-md mx-auto border border-border p-8">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Verifying reset link…</p>
        ) : !hasRecoverySession ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl">Reset link invalid or expired</h2>
            <p className="text-sm text-muted-foreground">
              Open the most recent reset email and click the link from this same browser, or request
              a new one.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-3">
            <h2 className="font-display text-2xl">Password updated</h2>
            <p className="text-sm text-muted-foreground">Redirecting to login…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="password"
                className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2"
              >
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border border-border px-4 py-3 font-body text-foreground focus:outline-none focus:border-primary"
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                At least 10 characters with upper, lower, and a number.
              </p>
            </div>
            <div>
              <label
                htmlFor="confirm"
                className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2"
              >
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-transparent border border-border px-4 py-3 font-body text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            {error && (
              <div role="alert" className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
