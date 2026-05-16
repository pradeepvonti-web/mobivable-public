import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { claimInitialAdmin, checkAdminAccess } from "@/lib/admin.functions";

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
  const checkFn = useServerFn(checkAdminAccess);
  const [state, setState] = useState<{ isAdmin: boolean; hasAnyAdmin: boolean } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    setCheckError(null);
    checkFn()
      .then((r) => setState(r))
      .catch((e) => {
        setState({ isAdmin: false, hasAnyAdmin: true });
        setCheckError(e instanceof Error ? e.message : "Access check failed");
      });
  }, [status, session?.user?.id, checkFn]);

  if (status === "loading" || (status === "authenticated" && state === null)) {
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
  if (!state?.isAdmin) {
    return (
      <PageShell eyebrow="ADMIN" title="Dashboard" intro="Platform management">
        <div className="mx-auto max-w-7xl px-6 py-16 space-y-4">
          <h1 className="font-display text-3xl">Access Denied</h1>
          <p className="text-sm text-muted-foreground">Your account doesn't have the <code>admin</code> role.</p>
          {checkError && <p className="text-xs text-destructive">{checkError}</p>}
          {!state?.hasAnyAdmin && (
            <PromoteButton onPromoted={() => setState({ isAdmin: true, hasAnyAdmin: true })} />
          )}
        </div>
      </PageShell>
    );
  }

  return <AdminDashboard />;
}


function PromoteButton({ onPromoted }: { onPromoted: () => void }) {
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimFn = useServerFn(claimInitialAdmin);


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
