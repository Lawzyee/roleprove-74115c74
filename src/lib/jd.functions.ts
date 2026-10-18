import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generatePersonalisedSimulation, generateGenericSimulation } from "./jd.server";
import { withUsage } from "./billing.server";

export const generateJdSimulationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ text: z.string().optional(), url: z.string().url().optional(), environment: z.enum(['sandbox', 'live']) })
      .refine((v) => Boolean(v.text?.trim() || v.url), { message: "Paste a job description or a link to one." })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    return withUsage(context.userId, data.environment, 'simulation', () => generatePersonalisedSimulation(context.userId, data), (result) => result.outcome === 'matched' ? result.attemptId : undefined);
  });

export const generateGenericSimulationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ environment: z.enum(['sandbox', 'live']) }).parse(data))
  .handler(async ({ data, context }) => {
    return withUsage(context.userId, data.environment, 'simulation', () => generateGenericSimulation(context.userId), (result) => result.attemptId);
  });

export const retakeSimulationFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ attemptId: z.string().uuid(), environment: z.enum(['sandbox', 'live']) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: original, error } = await context.supabase.from('simulation_attempts').select('simulation_id, simulation_type, job_posting_id').eq('id', data.attemptId).eq('user_id', context.userId).single();
    if (error || !original) throw new Error('Attempt not found.');
    return withUsage(context.userId, data.environment, 'simulation', async () => {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { data: attempt, error: insertError } = await supabaseAdmin.from('simulation_attempts').insert({ user_id: context.userId, simulation_id: original.simulation_id, simulation_type: original.simulation_type, job_posting_id: original.job_posting_id }).select('id').single();
      if (insertError) throw new Error(insertError.message);
      return { attemptId: attempt.id };
    }, (result) => result.attemptId);
  });
