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
          const { cleanNotifications, sendPendingEmails } = await import('@/lib/notifications.server')
          const notificationsRemoved = await cleanNotifications(supabaseAdmin)
          const notificationEmails = await sendPendingEmails(supabaseAdmin)
          const { purgeOldReports } = await import('@/lib/portfolio.server')
          const removed = await purgeExpiredExports(supabaseAdmin)
          const reportsRemoved = await purgeOldReports(supabaseAdmin)
          const { cleanJobCenter } = await import('@/lib/job-center.server')
          const { cleanEmployerJobs } = await import('@/lib/employer-jobs.server')
          const employerJobs = await cleanEmployerJobs(supabaseAdmin)
          const jobs = await cleanJobCenter(supabaseAdmin)
          const { cleanApplications } = await import('@/lib/applications.server')
          const applications = await cleanApplications(supabaseAdmin)
          const { cleanEmployerData } = await import('@/lib/employer.server')
          const employers = await cleanEmployerData(supabaseAdmin)
          const { cleanEmployerAccounts } = await import('@/lib/employer-accounts.server')
          const { eraseAccount } = await import('@/lib/account-deletion.server')
          // Unconfirmed employer sign-ups never reached billing, so no payment provider is needed.
          const employerAccounts = await cleanEmployerAccounts(supabaseAdmin, (userId) => eraseAccount({ admin: supabaseAdmin, userId, stripeFor: () => null }))
          return Response.json({ removed, reportsRemoved, jobs, employerJobs, applications, employers, employerAccounts, notificationsRemoved, notificationEmails })
        } catch (e) {
          console.error('purge exports', e)
          return new Response('Purge failed', { status: 500 })
        }
      },
    },
  },
})
