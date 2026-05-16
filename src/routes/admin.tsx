import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { supabase } from "@/integrations/supabase/client";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { claimInitialAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Mobivable" },
      { name: "description", content: "Manage your platform." },
    ],
  }),
});

function AdminPage() {
  const { session, status } = useRequiredSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [status, session?.user?.id]);

  if (status === "loading" || isAdmin === null) {
    return (
      <PageShell eyebrow="ADMIN" title="Dashboard" intro="Platform management">
        <div className="mx-auto max-w-7xl px-6 py-16 text-sm text-muted-foreground">Loading…</div>
      </PageShell>
    );
  }
  if (status === "unauthenticated") {
    return (
      <PageShell eyebrow="ADMIN" title="Dashboard" intro="Platform management">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="text-sm">Please <Link to="/login" className="underline">sign in</Link>.</p>
        </div>
      </PageShell>
    );
  }
  if (!isAdmin) {
    return (
      <PageShell eyebrow="ADMIN" title="Dashboard" intro="Platform management">
        <div className="mx-auto max-w-7xl px-6 py-16 space-y-4">
          <h1 className="font-display text-3xl">Access Denied</h1>
          <p className="text-sm text-muted-foreground">Your account doesn't have the <code>admin</code> role.</p>
          <PromoteButton onPromoted={() => setIsAdmin(true)} />
        </div>
      </PageShell>
    );
  }

  return <AdminDashboard />;
}

function PromoteButton({ onPromoted }: { onPromoted: () => void }) {
  const [checking, setChecking] = useState(true);
  const [hasAnyAdmin, setHasAnyAdmin] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimFn = useServerFn(claimInitialAdmin);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("id")
        .eq("role", "admin")
        .limit(1);
      setHasAnyAdmin((data?.length ?? 0) > 0);
      setChecking(false);
    })();
  }, []);

  if (checking || hasAnyAdmin) return null;

  async function handlePromote() {
    setPromoting(true);
    setError(null);
    try {
      const result = await claimFn();
      if (result.ok) {
        onPromoted();
      } else {
        setError(result.error ?? "Failed to claim admin.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
    setPromoting(false);
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 max-w-md space-y-3">
      <p className="text-sm font-medium">No admin exists yet</p>
      <p className="text-xs text-muted-foreground">
        Since no admin account has been set up, you can claim admin access for initial platform configuration.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handlePromote}
        disabled={promoting}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {promoting ? "Promoting…" : "Claim Admin Access"}
      </button>
    </div>
  );
}
