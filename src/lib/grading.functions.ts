import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gradeAttempt } from "./grading.server";

export const gradeAttemptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ attemptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    return gradeAttempt(context.supabase as any, context.userId, data.attemptId);
  });
