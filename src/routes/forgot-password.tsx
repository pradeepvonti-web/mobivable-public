import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logPasswordResetEvent } from "@/lib/admin.functions";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password — Mobivable" },
      { name: "description", content: "Request a secure password reset link." },
    ],
  }),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      // Always show success to avoid leaking whether the email exists.
      setSent(true);
    } catch (err) {
      // Even on rate-limit or transient errors, show generic success to avoid enumeration.
      // Only surface a hard error if it's a network/client issue.
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("network") || msg.includes("fetch")) {
        setError("Network error. Check your connection and try again.");
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      eyebrow="Account Recovery"
      title="Forgot password"
      intro="We'll email you a secure, single-use link to set a new password."
    >
      <div className="max-w-md mx-auto border border-border p-8">
        {sent ? (
          <div className="space-y-4">
            <h2 className="font-display text-2xl">Check your inbox</h2>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="font-mono">{email}</span>, a password reset
              link has been sent. The link expires shortly for your security.
            </p>
            <p className="text-xs text-muted-foreground">
              Didn't get it? Check spam, or{" "}
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
                className="underline underline-offset-4"
              >
                try again
              </button>
              .
            </p>
            <Link to="/login" className="block text-sm text-primary underline-offset-4 hover:underline">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              disabled={submitting || !email}
              className="w-full py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </PageShell>
  );
}
