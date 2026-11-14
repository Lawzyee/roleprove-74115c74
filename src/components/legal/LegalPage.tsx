import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import type { LegalDocument } from "@/content/legal";
import type { LegalBlock } from "@/content/legal/types";

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "p") return <p className="leading-relaxed text-muted-foreground">{block.text}</p>;
  if (block.type === "list")
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60">
          <tr>{block.head.map((h) => <th key={h} className="px-3 py-2 font-medium text-foreground">{h}</th>)}</tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row[0]} className="border-t border-border align-top">
              {row.map((cell, i) => <td key={i} className="px-3 py-2 text-muted-foreground">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalPage({ doc }: { doc: LegalDocument }) {
  const showToc = doc.sections.length > 3;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Legal</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {doc.lastUpdated}</p>
        <p className="mt-6 leading-relaxed">{doc.intro}</p>
        {showToc && (
          <nav aria-label="Contents" className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
            <p className="text-sm font-medium">Contents</p>
            <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
              {doc.sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="text-primary hover:underline">{s.heading}</a></li>
              ))}
            </ol>
          </nav>
        )}
        <div className="mt-10 space-y-10">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
              <h2 className="font-display text-xl font-semibold">{s.heading}</h2>
              {s.blocks.map((b, i) => <Block key={i} block={b} />)}
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-muted-foreground">
          Questions? Contact <a href="mailto:support@roleprove.com" className="text-primary underline">support@roleprove.com</a> or visit the{" "}
          <Link to="/help" className="text-primary underline">Help centre</Link>.
        </p>
      </main>
    </>
  );
}
