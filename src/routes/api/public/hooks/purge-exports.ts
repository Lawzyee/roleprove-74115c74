import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

// Hourly: deletes export zips older than 24 hours, visitor portfolio reports past retention, job-center expiry/link checks, and employer waitlist/submission data past retention.
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
          const { cleanEmployerData } = await import('@/lib/employer.server')
          const employers = await cleanEmployerData(supabaseAdmin)
          return Response.json({ removed, reportsRemoved, jobs, employers })
        } catch (e) {
          console.error('purge exports', e)
          return new Response('Purge failed', { status: 500 })
        }
      },
    },
  },
})
