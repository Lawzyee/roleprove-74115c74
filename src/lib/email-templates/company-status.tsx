import * as React from 'react'
import { Text } from '@react-email/components'
import { absoluteUrl } from '../site-url'
import type { TemplateEntry } from './registry'
import { EmployerEmail, p } from './employer-layout'

interface Props { company?: string; status?: 'approved' | 'rejected' | 'suspended'; reason?: string; url?: string }
const HEAD = { approved: 'Your company has been reviewed by RoleProve', rejected: 'Your company was not approved', suspended: 'Your company account has been suspended' } as const
const Email = ({ company, status = 'approved', reason, url }: Props) => (
  <EmployerEmail preview={HEAD[status]} title={HEAD[status]} action={{ label: 'Open your employer area', url }}>
    {status === 'approved' && <Text style={p}>Our team has reviewed {company ?? 'your company'}. It now shows as "Reviewed by RoleProve" in your employer area.</Text>}
    {status === 'rejected' && <Text style={p}>We reviewed {company ?? 'your company'} and could not approve it.</Text>}
    {status === 'suspended' && <Text style={p}>We have suspended {company ?? 'your company'}'s employer account. Your team can no longer use the employer area.</Text>}
    {reason ? <Text style={p}><strong>Reason:</strong> {reason}</Text> : null}
    {status !== 'approved' && <Text style={p}>If you think this is a mistake, contact support@roleprove.com.</Text>}
  </EmployerEmail>
)
export const template = {
  component: Email,
  subject: (d: Record<string, any>) => d.status === 'rejected' ? 'Your company was not approved' : d.status === 'suspended' ? 'Your company account has been suspended' : 'Your company has been reviewed by RoleProve',
  displayName: 'Company review decision',
  previewData: { company: 'Acme', status: 'rejected', reason: 'The website does not match the email domain.', url: absoluteUrl('/employer') },
} satisfies TemplateEntry
