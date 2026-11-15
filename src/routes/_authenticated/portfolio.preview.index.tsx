import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PortfolioView } from "@/components/portfolio/PublicView";
import { previewPortfolioFn } from "@/lib/portfolio.functions";

export const Route = createFileRoute("/_authenticated/portfolio/preview/")({
  head: () => ({
    meta: [
      { title: "Preview your portfolio | RoleProve" },
      { name: "description", content: "See your portfolio exactly as a visitor would." },
      { property: "og:title", content: "Preview your portfolio | RoleProve" },
      { property: "og:description", content: "See your portfolio exactly as a visitor would." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreviewPage,
});

export function PreviewBar() {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-accent px-5 py-2 text-sm">
      <span className="font-medium">Preview — this is what visitors with your link see.</span>
      <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/portfolio">Back to editing</Link></Button>
    </div>
  );
}

function PreviewPage() {
  const get = useServerFn(previewPortfolioFn);
  const q = useQuery({ queryKey: ["portfolio-preview"], queryFn: () => get() });
  return (
    <div className="min-h-screen bg-background">
      <PreviewBar />
      {q.data ? <PortfolioView portfolio={q.data.portfolio} mode="preview" /> : <p className="p-10 text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}
