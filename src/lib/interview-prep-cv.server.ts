import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DELIVERABLE_BUCKET } from "./deliverables.server";

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1]! : "";
}

async function pdfText(buffer: ArrayBuffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}

async function docxText(buffer: ArrayBuffer) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(buffer));
  const doc = files["word/document.xml"];
  if (!doc) return "";
  return strFromU8(doc)
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Downloads an uploaded CV from storage and extracts plain text. Returns "" if unreadable. */
export async function extractCvText(filePath: string): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.storage.from(DELIVERABLE_BUCKET).download(filePath);
    if (error || !data) return "";
    const buffer = await data.arrayBuffer();
    const ext = extensionOf(filePath);
    if (ext === "pdf") return (await pdfText(buffer)).slice(0, 20000);
    if (ext === "docx") return (await docxText(buffer)).slice(0, 20000);
    if (ext === "txt") return new TextDecoder().decode(buffer).slice(0, 20000);
    return "";
  } catch {
    return "";
  }
}
