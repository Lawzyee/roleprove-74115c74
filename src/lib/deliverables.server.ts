import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, any, any>;

export const DELIVERABLE_BUCKET = "deliverables";

export type DeliverableReview = { status: "auto_checked" | "pending_review"; feedback: string };

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1]! : "";
}

async function aiReview(kind: string, text: string): Promise<DeliverableReview> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey || text.trim().length < 80) {
    return {
      status: "pending_review",
      feedback: "Submitted — pending review. We stored the file as a work sample but couldn't read enough text to comment on it.",
    };
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: "You give short, fair feedback on a candidate's work sample. Reply with JSON only." },
        {
          role: "user",
          content: [
            `The candidate uploaded a ${kind} as their deliverable for a Data Analyst case study.`,
            "Comment briefly on: clarity of the recommendation, whether it follows a logical structure, and whether it references specific numbers from the case.",
            "This is feedback only — do not award a score.",
            "",
            `EXTRACTED CONTENT:\n${text.slice(0, 8000)}`,
            "",
            'Reply as JSON: {"feedback": "<2-3 sentences>"}',
          ].join("\n"),
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    return { status: "pending_review", feedback: "Submitted — pending review. Automated feedback was unavailable." };
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let parsed: { feedback?: string } = {};
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  return {
    status: "auto_checked",
    feedback: parsed.feedback
      ? `Feedback on your ${kind} (not scored): ${parsed.feedback}`
      : "Submitted — pending review.",
  };
}

function reviewCsv(buffer: ArrayBuffer): DeliverableReview {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { status: "pending_review", feedback: "Submitted — pending review. The file opened but looked empty." };
  }
  const columns = (lines[0] ?? "").split(",").length;
  return {
    status: "auto_checked",
    feedback: `Work sample received: the file opens cleanly with ${lines.length - 1} data rows across ${columns} columns. Your structured answers remain the scored source — this is stored as supporting evidence.`,
  };
}

async function reviewPdf(buffer: ArrayBuffer): Promise<DeliverableReview> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return aiReview("PDF summary", Array.isArray(text) ? text.join("\n") : String(text ?? ""));
  } catch {
    return { status: "pending_review", feedback: "Submitted — pending review. We couldn't read the text out of that PDF." };
  }
}

async function reviewPptx(buffer: ArrayBuffer): Promise<DeliverableReview> {
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(buffer));
    const slideText = Object.keys(files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort()
      .map((name) =>
        strFromU8(files[name]!)
          .replace(/<a:br\/>/g, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .join("\n");
    return aiReview("slide deck", slideText);
  } catch {
    return { status: "pending_review", feedback: "Submitted — pending review. We couldn't read the text out of that deck." };
  }
}

export async function reviewDeliverable(supabase: AnyClient, filePath: string, fileName: string): Promise<DeliverableReview> {
  const ext = extensionOf(fileName);

  if (ext === "png" || ext === "jpg" || ext === "jpeg") {
    return {
      status: "pending_review",
      feedback:
        "Submitted — pending review. Dashboard screenshots are stored as work samples and reviewed by a human; they do not affect your score.",
    };
  }
  if (ext === "xlsx") {
    return {
      status: "pending_review",
      feedback: "Submitted — pending review. Spreadsheet workbooks are kept as supporting evidence alongside your scored answers.",
    };
  }

  const { data, error } = await supabase.storage.from(DELIVERABLE_BUCKET).download(filePath);
  if (error || !data) {
    return { status: "pending_review", feedback: "Submitted — pending review. We stored the file but couldn't open it for checks." };
  }
  const buffer = await data.arrayBuffer();

  if (ext === "csv") return reviewCsv(buffer);
  if (ext === "pdf") return reviewPdf(buffer);
  if (ext === "pptx") return reviewPptx(buffer);

  return { status: "pending_review", feedback: "Submitted — pending review." };
}

export async function recordDeliverable(
  supabase: AnyClient,
  userId: string,
  input: { attemptId: string; taskId: string; filePath: string; fileName: string },
) {
  const { data: attempt, error } = await supabase
    .from("simulation_attempts")
    .select("id, user_id")
    .eq("id", input.attemptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!attempt || attempt.user_id !== userId) throw new Error("Attempt not found");

  const review = await reviewDeliverable(supabase, input.filePath, input.fileName);

  const { data, error: insertError } = await supabase
    .from("attempt_deliverables")
    .insert({
      attempt_id: input.attemptId,
      task_id: input.taskId,
      user_id: userId,
      file_path: input.filePath,
      file_name: input.fileName,
      file_type: extensionOf(input.fileName),
      status: review.status,
      feedback: review.feedback,
    } as any)
    .select("id, status, feedback, file_name")
    .single();
  if (insertError) throw new Error(insertError.message);

  return data;
}
