import { supabase } from "@/integrations/supabase/client";

export const FREE_ATTEMPT_LIMIT = 3;

export type Rubric = {
  max_score?: number;
  fields?: Array<{ key: string; label: string; answer: number; tolerance?: number; points: number }>;
  options?: string[];
  answer?: number;
  points?: number;
  criteria?: string[];
};

export async function startAttempt(userId: string, simulationId: string) {
  const { data: existing } = await supabase
    .from("simulation_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("simulation_id", simulationId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("simulation_attempts")
    .insert({ user_id: userId, simulation_id: simulationId })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export function compositeScore(attempts: Array<{ overall_score: number | null; status: string }>) {
  const done = attempts.filter((a) => a.status === "completed" && typeof a.overall_score === "number");
  if (!done.length) return null;
  return Math.round(done.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / done.length);
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
