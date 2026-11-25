import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmployerEmail, p } from './employer-layout'

interface Props { title?: string; company?: string; expires?: string; removeUrl?: string }
const Email = ({ title, company, expires, removeUrl }: Props) => (
  <EmployerEmail preview="Your job listing is live on RoleProve" title="Your job listing is live" removeLabel="Remove this listing" removeUrl={removeUrl}>
    <Text style={p}>Your listing{title ? ` "${title}"` : ''}{company ? ` at ${company}` : ''} was approved and now appears in the RoleProve Job center{expires ? ` until ${expires}` : ''}. Candidates apply on your website.</Text>
    <Text style={p}>You can take it down at any time with the link below. No sign-in needed.</Text>
  </EmployerEmail>
)
export const template = { component: Email, subject: (d: Record<string, any>) => d.title ? `Your listing is live: ${d.title}` : 'Your job listing is live on RoleProve', displayName: 'Employer job approved',
  previewData: { title: 'Data Analyst', company: 'Acme', expires: '2026-12-15', removeUrl: 'https://roleprove.com/employers/remove?token=example' } } satisfies TemplateEntry
