import { useState, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ClipboardList, Palette, Code, ShieldCheck, Rocket, Check, Loader2 } from 'lucide-react';
import { getProjectProgress, SDLC_PHASES, PHASE_ORDER, type SDLCPhase } from '@/lib/sdlc.functions';
import { supabase } from '@/integrations/supabase/client';
import { getRestoredSession } from '@/lib/require-auth';

/** Map each SDLC phase to a distinct Lucide icon */
const PHASE_ICONS: Record<SDLCPhase, typeof Check> = {
  requirements: ClipboardList,
  design: Palette,
  development: Code,
  testing: ShieldCheck,
  deployment: Rocket,
};

/**
 * Horizontal SDLC progress bar showing all 5 phases with status indicators.
 * Subscribes to realtime updates on the project_phases table so the bar
 * advances automatically when the backend calls advancePhase.
 */
export function SDLCProgressBar({ projectId }: { projectId: string }) {
  const [phases, setPhases] = useState<{ phase: SDLCPhase; status: string }[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>('requirements');
  const getProgress = useServerFn(getProjectProgress);

  // Initial fetch
  useEffect(() => {
    let active = true;

    (async () => {
      const session = await getRestoredSession();
      if (!active || !session) return;
      const res = await getProgress({ data: { projectId } });
      if (active && res.ok) {
        setPhases(res.phases);
        setCurrentPhase(res.currentPhase);
      }
    })().catch(() => {
      /* auth or network race; leave bar hidden until next valid refresh */
    });

    return () => {
      active = false;
    };
  }, [getProgress, projectId]);

  // Subscribe to realtime updates on project_phases
  useEffect(() => {
    let active = true;
    const ch = supabase.channel(`sdlc_${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'project_phases',
        filter: `project_id=eq.${projectId}`,
      }, () => {
        void getRestoredSession().then((session) => {
          if (!active || !session) return;
          return getProgress({ data: { projectId } });
        }).then((res) => {
          if (active && res?.ok) {
            setPhases(res.phases);
            setCurrentPhase(res.currentPhase);
          }
        }).catch(() => {
          /* ignore transient auth races during session refresh */
        });
      })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, [getProgress, projectId]);

  if (phases.length === 0) return null;

  return (
    <div className="flex items-center gap-0 px-4 py-3 bg-card/60 border-b border-border">
      {PHASE_ORDER.map((phase, i) => {
        const info = SDLC_PHASES[phase];
        const phaseData = phases.find(p => p.phase === phase);
        const status = phaseData?.status ?? 'pending';
        const Icon = PHASE_ICONS[phase];
        const isActive = status === 'active';
        const isCompleted = status === 'completed';

        return (
          <div key={phase} className="flex items-center flex-1">
            {/* Phase pill */}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest transition-all ${
                isCompleted
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : isActive
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/10 text-muted-foreground/40'
              }`}
            >
              {isCompleted ? (
                <Check className="h-3 w-3" />
              ) : isActive ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">{info.label}</span>
            </div>

            {/* Connector line between phases */}
            {i < PHASE_ORDER.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 ${
                  isCompleted ? 'bg-emerald-500/40' : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
