import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Login — Mobivable" },
      { name: "description", content: "Access your Mobivable workspace." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      eyebrow="Access Terminal"
      title="Resume Build"
      intro="Sign in to your Mobivable workspace and pick up where your chat thread left off."
    >
      <div className="max-w-md mx-auto border border-border p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
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
          <div>
            <label htmlFor="password" className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border border-border px-4 py-3 font-body text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {error && (
            <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
          >
            {submitting ? "Authenticating…" : "Login"}
          </button>

          <p className="text-center text-sm text-muted">
            No account?{" "}
            <Link to="/signup" search={{ plan: "free_beta" }} className="text-primary underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </PageShell>
  );
}
