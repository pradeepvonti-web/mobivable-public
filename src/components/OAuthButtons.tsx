import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  /** Used as user metadata for new signups (e.g. selected plan). */
  metadata?: Record<string, string>;
  onError?: (msg: string) => void;
};

export function OAuthButtons({ onError }: Props) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<"google" | "apple" | null>(null);

  const signIn = async (provider: "google" | "apple") => {
    setPending(provider);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) {
        onError?.(error.message || `${provider} sign-in failed.`);
        setPending(null);
        return;
      }
      // Browser will redirect to the OAuth provider
    } catch (e) {
      onError?.(e instanceof Error ? e.message : `${provider} sign-in failed.`);
      setPending(null);
    }
  };

  const base =
    "w-full py-3 border border-border font-display uppercase tracking-wider text-sm hover:border-primary hover:text-primary transition-colors disabled:opacity-50 flex items-center justify-center gap-3";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => signIn("google")}
        disabled={pending !== null}
        className={base}
      >
        <GoogleIcon />
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </button>
      <button
        type="button"
        onClick={() => signIn("apple")}
        disabled={pending !== null}
        className={base}
      >
        <AppleIcon />
        {pending === "apple" ? "Redirecting…" : "Continue with Apple"}
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.2-5.5 4.2-3.3 0-6-2.7-6-6.1S8.7 6.1 12 6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.6 14.6 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.4 12.7c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.2.9-4 2.4-1.7 3-.4 7.5 1.3 9.9.8 1.2 1.8 2.5 3.1 2.5 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.9zM14.2 5.6c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2-.5 2.8-1.3z"/>
    </svg>
  );
}
