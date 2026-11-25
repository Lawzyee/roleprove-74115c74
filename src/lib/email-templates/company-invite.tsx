import * as React from 'react'
import { Text } from '@react-email/components'
import { absoluteUrl } from '../site-url'
import type { TemplateEntry } from './registry'
import { EmployerEmail, p } from './employer-layout'

interface Props { company?: string; inviter?: string; url?: string; days?: number }
const Email = ({ company, inviter, url, days = 7 }: Props) => (
  <EmployerEmail preview={`Join ${company ?? 'your company'} on RoleProve`} title={`Join ${company ?? 'your company'} on RoleProve`} action={{ label: 'Accept the invite', url }}>
    <Text style={p}>{inviter ?? 'A colleague'} invited you to join {company ?? 'their company'}'s employer account on RoleProve.</Text>
    <Text style={p}>The link works once and expires in {days} days. If you weren't expecting this, you can ignore this email.</Text>
  </EmployerEmail>
)
export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Join ${d.company ?? 'your company'} on RoleProve`,
  displayName: 'Company team invite',
  previewData: { company: 'Acme', inviter: 'Jane Doe', url: absoluteUrl('/employers/invite', { token: 'example' }), days: 7 },
} satisfies TemplateEntry
