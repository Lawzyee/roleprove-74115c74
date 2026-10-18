import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPrepSession, gradePrepAnswer } from "./interview-prep.server";
import { withUsage } from './billing.server';

export const createPrepSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        text: z.string().optional(),
        url: z.string().url().optional(),
        cvFilePath: z.string().optional(),
        environment: z.enum(['sandbox', 'live']),
      })
      .refine((v) => Boolean(v.text?.trim() || v.url), { message: "Paste a job description or a link to one." })
      .parse(data),
  )

  .handler(async ({ data, context }) => withUsage(context.userId, data.environment, 'interview_prep', () => createPrepSession(context.userId, data), (result) => result.outcome === 'ready' ? result.sessionId : undefined));

export const gradePrepAnswerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ questionId: z.string().uuid(), responseText: z.string() }).parse(data),
  )
  .handler(async ({ data, context }) => gradePrepAnswer(context.userId, data.questionId, data.responseText));
