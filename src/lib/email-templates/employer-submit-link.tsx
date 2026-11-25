import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmployerEmail, p } from './employer-layout'

interface Props { submitUrl?: string }
const Email = ({ submitUrl }: Props) => (
  <EmployerEmail preview="Confirm your email to list a job on RoleProve" title="Confirm your email to list a job" action={{ label: 'Confirm and open the job form', url: submitUrl }}>
    <Text style={p}>Open this link to confirm your work email. You'll then have 24 hours to submit job listings from this browser link. No account or password is needed.</Text>
    <Text style={p}>Listings are reviewed by our team before they appear. If you didn't request this, you can ignore this email.</Text>
  </EmployerEmail>
)
export const template = { component: Email, subject: 'Confirm your email to list a job on RoleProve', displayName: 'Employer job link confirmation',
  previewData: { submitUrl: 'https://roleprove.com/employers/submit?token=example' } } satisfies TemplateEntry
