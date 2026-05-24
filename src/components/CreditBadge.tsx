import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CreditBadge() {
  const { data, isLoading } = useCredits();
  if (isLoading || !data) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Zap className="w-3 h-3" /> --
      </div>
    );
  }
  const total = data.daily_remaining + data.monthly_remaining;
  const low = total < 5;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 border font-mono text-[10px] uppercase tracking-widest transition-colors ${
            low
              ? "border-destructive text-destructive hover:bg-destructive hover:text-background"
              : "border-border text-foreground hover:bg-primary hover:text-background hover:border-primary"
          }`}
          aria-label="AI credits"
        >
          <Zap className="w-3 h-3" />
          {total} cr
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 font-mono text-xs">
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Credits</div>
          <div className="font-display text-2xl uppercase">{total}</div>
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          {data.daily_granted > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily</span>
              <span>
                {data.daily_remaining} / {data.daily_granted}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly</span>
            <span>
              {data.monthly_remaining} / {data.monthly_granted}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="uppercase">{data.plan.replace("_", " ")}</span>
          </div>
        </div>
        <Link
          to="/pricing"
          className="mt-4 block text-center px-3 py-2 bg-primary text-background uppercase tracking-widest text-[10px]"
        >
          {low ? "Out of credits — upgrade" : "Upgrade plan"}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
