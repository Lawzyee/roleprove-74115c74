import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DeliverableError, gradeAttemptDeliverables, recordDeliverable } from "./deliverables.server";

export const recordDeliverableFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        taskId: z.string().uuid(),
        filePath: z.string().min(1).max(500),
        fileName: z.string().min(1).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    try {
      return { ok: true as const, record: await recordDeliverable(context.supabase, context.userId, data) };
    } catch (err) {
      if (err instanceof DeliverableError) return { ok: false as const, error: err.message };
      throw err;
    }
  });

export const gradeDeliverablesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ attemptId: z.string().uuid(), includeLegacy: z.boolean().optional() }).parse(data))
  .handler(async ({ data, context }) => gradeAttemptDeliverables(context.supabase, context.userId, data.attemptId, data.includeLegacy ?? false));
