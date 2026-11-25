import * as React from 'react'
import { Text } from '@react-email/components'
import { absoluteUrl } from '../site-url'
import type { TemplateEntry } from './registry'
import { EmployerEmail, p } from './employer-layout'

interface Props { name?: string; confirmUrl?: string; removeUrl?: string }
const Email = ({ name, confirmUrl, removeUrl }: Props) => (
  <EmployerEmail preview="Confirm your place on the RoleProve employer waitlist" title="Confirm your place on the waitlist"
    action={{ label: 'Confirm my place', url: confirmUrl }} removeLabel="Remove me from the employer waitlist" removeUrl={removeUrl}>
    <Text style={p}>{name ? `Hi ${name},` : 'Hi,'}</Text>
    <Text style={p}>Thanks for your interest in RoleProve for employers. Please confirm your email to join the waitlist. We'll only contact you about RoleProve's employer features.</Text>
    <Text style={p}>If you didn't request this, ignore this email and the entry will be deleted automatically.</Text>
  </EmployerEmail>
)
export const template = { component: Email, subject: 'Confirm your place on the RoleProve employer waitlist', displayName: 'Employer waitlist confirmation',
  previewData: { name: 'Sam', confirmUrl: absoluteUrl('/employers/confirm', { token: 'example' }), removeUrl: absoluteUrl('/employers/leave', { token: 'example' }) } } satisfies TemplateEntry
