import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { OAuthButtons } from "@/components/OAuthButtons";
import { logAdminLoginAttempt } from "@/lib/admin.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Login — Mobivable" },
      { name: "description", content: "Access your Mobivable workspace." },
    ],
  }),
});

const DEMO_EMAIL = "demo@mobivable.com";
const DEMO_PASSWORD = "DemoUser123!";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const logAttempt = useServerFn(logAdminLoginAttempt);
  function audit(targetEmail: string, success: boolean, reason?: string) {
    // Fire-and-forget; server filters to admin emails only.
    void logAttempt({ data: { email: targetEmail, success, reason } }).catch(() => {});
  }

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
      if (error) {
        audit(email, false, error.message);
        throw error;
      }
      audit(email, true);
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

          <div className="text-right -mt-2">
            <Link
              to="/forgot-password"
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              Forgot password?
            </Link>
          </div>

          {error && (
            <div role="alert" aria-live="polite" className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 space-y-2">
              <p className="font-mono">{error}</p>
              {errorHint && <p className="text-xs text-destructive/80">{errorHint}</p>}
              <p className="text-xs">
                <a
                  href="/docs"
                  className="underline underline-offset-4 hover:no-underline"
                >
                  Troubleshooting sign-in issues →
                </a>
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || demoLoading}
            className="w-full py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
          >
            {submitting ? "Authenticating…" : "Login"}
          </button>

          {/* ─── Google for Startups AI Agents Challenge – Demo ─── */}
          <div className="relative mt-2">
            {/* Google 4-color gradient border */}
            <div
              aria-hidden
              className="absolute -inset-px rounded-lg"
              style={{
                background: "linear-gradient(135deg, #4285F4, #EA4335, #FBBC04, #34A853)",
                opacity: 0.85,
              }}
            />
            <button
              id="demo-login"
              type="button"
              disabled={submitting || demoLoading}
              onClick={async () => {
                clearError();
                setDemoLoading(true);
                try {
                  const { error } = await supabase.auth.signInWithPassword({
                    email: DEMO_EMAIL,
                    password: DEMO_PASSWORD,
                  });
                  if (error) {
                    showAuthError(error.message, "user");
                  } else {
                    navigate({ to: "/dashboard" });
                  }
                } catch (err) {
                  showAuthError(
                    err instanceof Error ? err.message : "Demo login failed.",
                    "user",
                  );
                } finally {
                  setDemoLoading(false);
                }
              }}
              className="relative w-full py-4 px-6 bg-background rounded-lg font-display text-lg tracking-wider transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <span className="flex flex-col items-center gap-1.5">
                <span className="flex items-center gap-2 text-foreground">
                  {/* Google 4-color dots */}
                  <span className="flex gap-1" aria-hidden>
                    <span className="h-2 w-2 rounded-full" style={{ background: "#4285F4" }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: "#EA4335" }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: "#FBBC04" }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: "#34A853" }} />
                  </span>
                  <span className="uppercase">
                    {demoLoading ? "Launching Demo…" : "Try Live Demo"}
                  </span>
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Google for Startups · AI Agents Challenge
                </span>
              </span>
            </button>
          </div>

          {import.meta.env.DEV && (
            <>
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
                Test Login (dev only)
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setEmail("pradeepvonti@aksdataai.com");
                  setPassword("");
                  clearError();
                  document.getElementById("password")?.focus();
                }}
                className="w-full py-3 border border-dashed border-accent text-accent-foreground font-display uppercase tracking-wider hover:bg-accent hover:text-accent-foreground transition-all disabled:opacity-50"
              >
                Admin Login (dev only)
              </button>
            </>
          )}

          <div className="border border-border/60 bg-muted/20 p-4 space-y-2 text-xs text-muted-foreground">
            <p className="font-mono text-[10px] uppercase tracking-widest text-foreground">
              Admin password reset
            </p>
            <p>
              Admin accounts use the same secure reset flow as regular users. Request a link from{" "}
              <Link to="/forgot-password" className="text-primary underline-offset-4 hover:underline">
                Forgot password
              </Link>{" "}
              using the admin email — the link is single-use, expires shortly, and lands you on a page
              to choose a new password.
            </p>
            <p>
              If no link arrives, the address may not be tied to an admin account. Contact the platform
              owner to provision admin access, or claim it from the{" "}
              <Link to="/admin" className="text-primary underline-offset-4 hover:underline">
                /admin
              </Link>{" "}
              page when no admin exists yet.
            </p>
          </div>

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
