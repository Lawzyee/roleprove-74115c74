import { createFileRoute } from '@tanstack/react-router'

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

// Serves a portfolio photo only while that portfolio is public. Private, unknown and photo-less all get the same 404.
export const Route = createFileRoute('/api/public/portfolio-photo/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = String(params.slug ?? '').toLowerCase()
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { loadPublicPortfolioRow, rateOk, PHOTO_BUCKET } = await import('@/lib/portfolio.server')
        if (!(await rateOk(supabaseAdmin, slug))) return new Response('Too many requests', { status: 429 })
        const row = await loadPublicPortfolioRow(supabaseAdmin, slug).catch(() => null)
        if (!row?.photo_path) return notFound()
        const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).download(row.photo_path)
        if (error || !data) return notFound()
        return new Response(data, {
          headers: {
            'Content-Type': data.type || 'image/jpeg',
            // Short cache so making the portfolio private takes effect immediately.
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})
