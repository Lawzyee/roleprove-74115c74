import type { ComponentType } from 'react'
import { template as billingUpdate } from './billing-update'
import { template as dataExportRequested } from './data-export-requested'
import { template as employerWaitlistConfirm } from './employer-waitlist-confirm'
import { template as employerSubmitLink } from './employer-submit-link'
import { template as employerJobApproved } from './employer-job-approved'
import { template as employerJobRejected } from './employer-job-rejected'
import { template as newNotification } from './new-notification'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'billing-update': billingUpdate,
  'data-export-requested': dataExportRequested,
  'employer-waitlist-confirm': employerWaitlistConfirm,
  'employer-submit-link': employerSubmitLink,
  'employer-job-approved': employerJobApproved,
  'employer-job-rejected': employerJobRejected,
  'new-notification': newNotification,
  // Add templates here as they are created, e.g.:
  // 'welcome': welcomeTemplate,
}
