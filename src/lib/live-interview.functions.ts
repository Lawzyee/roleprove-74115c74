import { requireCandidate } from './candidate-middleware';
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withUsage } from "./billing.server";
import { endInterview, postAnswer, skipQuestion, startLiveInterview } from "./live-interview.server";

export const startLiveInterviewFn = createServerFn({ method: "POST" })
  .middleware([requireCandidate])
  .inputValidator((data: unknown) =>
    z
      .object({
        prepSessionId: z.string().uuid().optional(),
        roleKey: z.enum(["data_analyst", "customer_support"]).optional(),
        length: z.enum(["short", "standard"]),
        environment: z.enum(["sandbox", "live"]),
      })
      .refine((v) => Boolean(v.prepSessionId || v.roleKey), { message: "Choose a prep session or a role." })
      .parse(data),
  )
  // Starting counts as one interview prep use — reserved before any AI call.
  .handler(async ({ data, context }) =>
    withUsage(
      context.userId,
      data.environment,
      "interview_prep",
      () => startLiveInterview(context.userId, data),
      (result) => (result.outcome === "ready" ? result.interviewId : undefined),
    ),
  );

export const postAnswerFn = createServerFn({ method: "POST" })
  .middleware([requireCandidate])
  .inputValidator((data: unknown) =>
    z.object({ interviewId: z.string().uuid(), answer: z.string().min(1).max(10000) }).parse(data),
  )
  .handler(async ({ data, context }) => postAnswer(context.userId, data.interviewId, data.answer));

export const skipQuestionFn = createServerFn({ method: "POST" })
  .middleware([requireCandidate])
  .inputValidator((data: unknown) => z.object({ interviewId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => skipQuestion(context.userId, data.interviewId));

export const endInterviewFn = createServerFn({ method: "POST" })
  .middleware([requireCandidate])
  .inputValidator((data: unknown) => z.object({ interviewId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => endInterview(context.userId, data.interviewId));
