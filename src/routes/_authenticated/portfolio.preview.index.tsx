import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PortfolioView, PreviewBar } from "@/components/portfolio/PublicView";
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
