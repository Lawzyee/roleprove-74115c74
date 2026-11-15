import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

// Hourly: deletes export zips older than 24 hours, and visitor portfolio reports past their retention period.
export const Route = createFileRoute('/api/public/hooks/purge-exports')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request)
        if (denied) return denied
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { purgeExpiredExports } = await import('@/lib/data-export.server')
        try {
          const { purgeOldReports } = await import('@/lib/portfolio.server')
          const removed = await purgeExpiredExports(supabaseAdmin)
          const reportsRemoved = await purgeOldReports(supabaseAdmin)
          const { cleanJobCenter } = await import('@/lib/job-center.server')
          const jobs = await cleanJobCenter(supabaseAdmin)
          return Response.json({ removed, reportsRemoved, jobs })
        } catch (e) {
          console.error('purge exports', e)
          return new Response('Purge failed', { status: 500 })
        }
      },
    },
  },
})
