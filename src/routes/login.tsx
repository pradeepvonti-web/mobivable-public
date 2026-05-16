import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { OAuthButtons } from "@/components/OAuthButtons";

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
  const [errorHint, setErrorHint] = useState<string | null>(null);

  function describeAuthError(msg: string, context: "user" | "admin"): { title: string; hint: string } {
    const m = msg.toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid_credentials") || m.includes("invalid credentials")) {
      return {
        title: context === "admin"
          ? "Admin sign-in failed: wrong email or password."
          : "Wrong email or password.",
        hint: "Double-check the credentials. If the admin account hasn't been provisioned yet, contact the platform owner to reset it.",
      };
    }
    if (m.includes("email not confirmed") || m.includes("not confirmed")) {
      return { title: "Email not confirmed.", hint: "Check your inbox for the confirmation link before signing in." };
    }
    if (m.includes("user not found") || m.includes("no user")) {
      return {
        title: context === "admin" ? "Admin account is missing." : "No account found for this email.",
        hint: context === "admin"
          ? "The admin user hasn't been created. Ask the platform owner to provision it, or claim admin access on the /admin page."
          : "Create an account or use a different email.",
      };
    }
    if (m.includes("rate") || m.includes("too many")) {
      return { title: "Too many attempts.", hint: "Wait a minute before trying again." };
    }
    if (m.includes("network") || m.includes("fetch")) {
      return { title: "Network error.", hint: "Check your connection and retry." };
    }
    return {
      title: context === "admin" ? `Admin sign-in failed: ${msg}` : msg,
      hint: "Verify the email and password are correct. If the issue persists, contact the platform owner.",
    };
  }

  function showAuthError(msg: string, context: "user" | "admin") {
    const { title, hint } = describeAuthError(msg, context);
    setError(title);
    setErrorHint(hint);
  }

  function clearError() {
    setError(null);
    setErrorHint(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err) {
      showAuthError(err instanceof Error ? err.message : "Login failed.", "user");
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
        <OAuthButtons onError={setError} />
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
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
            <label htmlFor="password" className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
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
            <div role="alert" aria-live="polite" className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 space-y-2">
              <p className="font-mono">{error}</p>
              {errorHint && <p className="text-xs text-destructive/80">{errorHint}</p>}
              <p className="text-xs">
                <a
                  href="https://docs.lovable.dev/features/security#troubleshooting-login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:no-underline"
                >
                  Troubleshooting sign-in issues →
                </a>
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
          >
            {submitting ? "Authenticating…" : "Login"}
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              clearError();
              setSubmitting(true);
              const { error } = await supabase.auth.signInWithPassword({
                email: "test@example.com",
                password: "TestUser123!",
              });
              setSubmitting(false);
              if (error) showAuthError(error.message, "user");
              else navigate({ to: "/dashboard" });
            }}
            className="w-full py-3 border border-dashed border-primary text-primary font-display uppercase tracking-wider hover:bg-primary hover:text-background transition-all disabled:opacity-50"
          >
            Test Login
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              clearError();
              setSubmitting(true);
              const { error } = await supabase.auth.signInWithPassword({
                email: "pradeepvonti@aksdataai.com",
                password: "Anushka01@",
              });
              setSubmitting(false);
              if (error) showAuthError(error.message, "admin");
              else navigate({ to: "/admin" });
            }}
            className="w-full py-3 border border-dashed border-accent text-accent-foreground font-display uppercase tracking-wider hover:bg-accent hover:text-accent-foreground transition-all disabled:opacity-50"
          >
            Admin Login
          </button>

          <p className="text-center text-sm text-muted-foreground">
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
