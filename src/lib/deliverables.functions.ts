import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordDeliverable } from "./deliverables.server";

export const recordDeliverableFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        taskId: z.string().uuid(),
        filePath: z.string().min(1),
        fileName: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => recordDeliverable(context.supabase, context.userId, data));
