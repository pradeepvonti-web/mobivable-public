/**
 * Build Match Report — shows which AI provider was chosen by the vision
 * judge, its confidence score, the rationale, and a link to the JSON
 * comparison artifact (mockup + per-candidate summaries + scores).
 *
 * Reads `projects.attachments.build_match` populated by the mockup pipeline
 * in `finalizeAgentRun`. Renders nothing when no match metadata exists.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Trophy, Sparkles } from "lucide-react";

type Candidate = { model: string; score: number; isWinner: boolean };
type BuildMatch = {
  winnerModel?: string;
  winnerScore?: number;
  candidates?: Candidate[];
  failed?: { model: string; error: string }[];
  rationale?: string;
  comparisonReportUrl?: string | null;
  mockupUrl?: string;
  generatedAt?: string;
};

export function BuildMatchCard({ projectId }: { projectId: string }) {
  const [match, setMatch] = useState<BuildMatch | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("attachments")
        .eq("id", projectId)
        .maybeSingle();
      if (!active) return;
      const att = data?.attachments;
      if (att && typeof att === "object" && !Array.isArray(att)) {
        const bm = (att as Record<string, unknown>).build_match;
        if (bm && typeof bm === "object") setMatch(bm as BuildMatch);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!match || !match.winnerModel) return null;

  const score = typeof match.winnerScore === "number" ? match.winnerScore : null;
  const scoreColor =
    score === null
      ? "text-muted-foreground"
      : score >= 80
        ? "text-emerald-500"
        : score >= 60
          ? "text-amber-500"
          : "text-destructive";

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-primary/15 grid place-items-center text-primary ring-1 ring-primary/30">
          <Trophy className="h-3.5 w-3.5" />
        </div>
        <h4 className="font-display text-[11px] uppercase tracking-widest text-muted-foreground">
          Build Match Report
        </h4>
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="text-sm">
          <span className="text-muted-foreground">Provider:</span>{" "}
          <span className="font-mono font-semibold text-foreground">{match.winnerModel}</span>
        </div>
        {score !== null && (
          <div className="text-sm">
            <span className="text-muted-foreground">Confidence:</span>{" "}
            <span className={`font-mono font-semibold tabular-nums ${scoreColor}`}>
              {score}/100
            </span>
          </div>
        )}
      </div>

      {score !== null && (
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              score >= 80
                ? "bg-emerald-500"
                : score >= 60
                  ? "bg-amber-500"
                  : "bg-destructive"
            }`}
            style={{ width: `${Math.max(2, score)}%` }}
          />
        </div>
      )}

      {match.rationale && (
        <p className="text-xs text-foreground/80 leading-relaxed italic flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 mt-0.5 text-primary shrink-0" />
          <span>{match.rationale}</span>
        </p>
      )}

      {match.candidates && match.candidates.length > 1 && (
        <div className="space-y-1.5 pt-1 border-t border-border/60">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
            Candidates ranked
          </p>
          {match.candidates
            .slice()
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .map((c) => (
              <div key={c.model} className="flex items-center gap-2 text-xs">
                <span
                  className={`font-mono truncate flex-1 ${
                    c.isWinner ? "text-foreground font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {c.isWinner && "🏆 "}
                  {c.model}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground w-12 text-right">
                  {c.score}/100
                </span>
              </div>
            ))}
        </div>
      )}

      {match.comparisonReportUrl && (
        <a
          href={match.comparisonReportUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          View comparison artifacts (JSON)
        </a>
      )}
    </div>
  );
}
