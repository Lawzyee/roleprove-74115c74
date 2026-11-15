import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicPortfolioFn } from "@/lib/portfolio.functions";
import { NotFoundPortfolio, PortfolioView } from "@/components/portfolio/PublicView";

export const Route = createFileRoute("/p/$slug/")({
  loader: async ({ params }) => {
    const r = await getPublicPortfolioFn({ data: { slug: params.slug } });
    // Private, unpublished and unknown slugs all end here with the same not-found page.
    if (!r.found) throw notFound();
    return r;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData?.found) return { meta: [{ title: "Page not found | RoleProve" }, { name: "robots", content: "noindex" }] };
    const p = loaderData.portfolio;
    const title = `${p.name}${p.headline ? ` — ${p.headline}` : ""} | RoleProve portfolio`;
    const description = p.bio?.slice(0, 160) || `${p.name}'s portfolio of hands-on job simulation projects on RoleProve.`;
    const url = `https://roleprove.com/p/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
        ...(p.photoUrl ? [{ property: "og:image", content: p.photoUrl }, { name: "twitter:image", content: p.photoUrl }] : []),
        ...(p.indexable ? [] : [{ name: "robots", content: "noindex, nofollow" }]),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: NotFoundPortfolio,
  component: PublicPortfolioPage,
});

function PublicPortfolioPage() {
  const data = Route.useLoaderData();
  if (!data.found) return <NotFoundPortfolio />;
  return <main className="min-h-screen bg-background"><PortfolioView portfolio={data.portfolio} mode="public" cta={data.cta} /></main>;
}
