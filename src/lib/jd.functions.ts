import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generatePersonalisedSimulation } from "./jd.server";

export const generateJdSimulationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ text: z.string().optional(), url: z.string().url().optional() })
      .refine((v) => Boolean(v.text?.trim() || v.url), { message: "Paste a job description or a link to one." })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    return generatePersonalisedSimulation(context.userId, data);
  });

export const generateGenericSimulationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateGenericSimulation } = await import("./jd.server");
    return generateGenericSimulation(context.userId);
  });
