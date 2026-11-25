import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmployerEmail, p } from './employer-layout'

interface Props { title?: string; company?: string; reason?: string; note?: string; removeUrl?: string }
const Email = ({ title, company, reason, note, removeUrl }: Props) => (
  <EmployerEmail preview="Your job listing was not approved" title="Your job listing was not approved" removeLabel="Remove this listing" removeUrl={removeUrl}>
    <Text style={p}>We reviewed your listing{title ? ` "${title}"` : ''}{company ? ` at ${company}` : ''} and could not publish it.</Text>
    <Text style={p}><strong>Reason:</strong> {reason ?? 'other'}</Text>
    {note ? <Text style={p}><strong>Note from our team:</strong> {note}</Text> : null}
    <Text style={p}>If you think this is a mistake, reply to support@roleprove.com. You can also delete the submission now with the link below.</Text>
  </EmployerEmail>
)
export const template = { component: Email, subject: (d: Record<string, any>) => d.title ? `Your listing was not approved: ${d.title}` : 'Your job listing was not approved', displayName: 'Employer job rejected',
  previewData: { title: 'Data Analyst', company: 'Acme', reason: 'link not working', note: 'The apply link returned an error.', removeUrl: 'https://roleprove.com/employers/remove?token=example' } } satisfies TemplateEntry
