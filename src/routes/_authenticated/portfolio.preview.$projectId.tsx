import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ProjectView } from "@/components/portfolio/PublicView";
import { previewProjectFn } from "@/lib/portfolio.functions";
import { PreviewBar } from "./portfolio.preview.index";

export const Route = createFileRoute("/_authenticated/portfolio/preview/$projectId")({
  head: () => ({
    meta: [
      { title: "Preview project | RoleProve" },
      { name: "description", content: "See this portfolio project exactly as a visitor would." },
      { property: "og:title", content: "Preview project | RoleProve" },
      { property: "og:description", content: "See this portfolio project exactly as a visitor would." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreviewProjectPage,
});

function PreviewProjectPage() {
  const { projectId } = Route.useParams();
  const get = useServerFn(previewProjectFn);
  const q = useQuery({ queryKey: ["portfolio-preview-project", projectId], queryFn: () => get({ data: { projectId } }) });
  return (
    <div className="min-h-screen bg-background">
      <PreviewBar />
      {q.isLoading ? <p className="p-10 text-sm text-muted-foreground">Loading…</p> : q.data?.found ? <ProjectView project={q.data.project} mode="preview" /> : <p className="p-10">Project not found.</p>}
    </div>
  );
}
