import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCreditBalance } from "@/lib/credits.functions";

export function useCredits() {
  const fetchBalance = useServerFn(getCreditBalance);
  const query = useQuery({
    queryKey: ["ai-credits"],
    queryFn: () => fetchBalance(),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  return query;
}

export function useInvalidateCredits() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ai-credits"] });
}
