import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

// Hourly: deletes export zips that are older than 24 hours.
export const Route = createFileRoute('/api/public/hooks/purge-exports')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request)
        if (denied) return denied
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { purgeExpiredExports } = await import('@/lib/data-export.server')
        try {
          return Response.json({ removed: await purgeExpiredExports(supabaseAdmin) })
        } catch (e) {
          console.error('purge exports', e)
          return new Response('Purge failed', { status: 500 })
        }
      },
    },
  },
})
