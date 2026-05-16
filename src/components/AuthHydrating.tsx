import { PageShell } from "@/components/PageShell";

export function AuthHydrating() {
  return (
    <PageShell
      eyebrow="Authenticating"
      title="Restoring Session"
      intro="Verifying your credentials and rehydrating your workspace."
    >
      <div className="flex flex-col items-center justify-center py-16 gap-6">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-2 border-border" />
          <div className="absolute inset-0 border-2 border-primary border-t-transparent border-r-transparent animate-spin" />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Handshake in progress…
        </p>
      </div>
    </PageShell>
  );
}
