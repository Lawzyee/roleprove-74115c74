import { requireCandidate } from './candidate-middleware';
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gradeAttempt } from "./grading.server";

export const gradeAttemptFn = createServerFn({ method: "POST" })
  .middleware([requireCandidate])
  .inputValidator((data: unknown) => z.object({ attemptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    return gradeAttempt(context.supabase as any, context.userId, data.attemptId);
  });
