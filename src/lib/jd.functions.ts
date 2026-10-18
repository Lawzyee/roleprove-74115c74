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
