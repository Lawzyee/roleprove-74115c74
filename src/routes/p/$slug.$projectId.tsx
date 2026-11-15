import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicProjectFn } from "@/lib/portfolio.functions";
import { NotFoundPortfolio, ProjectView } from "@/components/portfolio/PublicView";

export const Route = createFileRoute("/p/$slug/$projectId")({
  loader: async ({ params }) => {
    const r = await getPublicProjectFn({ data: { slug: params.slug, projectId: params.projectId } });
    if (!r.found) throw notFound();
    return r;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData?.found) return { meta: [{ title: "Page not found | RoleProve" }, { name: "robots", content: "noindex" }] };
    const p = loaderData.project;
    const title = `${p.title} — ${p.ownerName} | RoleProve`;
    const description = p.insight?.slice(0, 160) || `${p.ownerName}'s ${p.role} practice project on RoleProve.`;
    const url = `https://roleprove.com/p/${params.slug}/${params.projectId}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
        ...(p.photoUrl ? [{ property: "og:image", content: p.photoUrl }, { name: "twitter:image", content: p.photoUrl }] : []),
        ...(p.indexable ? [] : [{ name: "robots", content: "noindex, nofollow" }]),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: NotFoundPortfolio,
  component: PublicProjectPage,
});

function PublicProjectPage() {
  const data = Route.useLoaderData();
  if (!data.found) return <NotFoundPortfolio />;
  return <main className="min-h-screen bg-background"><ProjectView project={data.project} mode="public" cta={data.cta} /></main>;
}
