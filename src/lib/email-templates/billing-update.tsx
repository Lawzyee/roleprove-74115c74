import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'

type Kind = 'started' | 'payment_failed' | 'cancelled'
interface Props { kind?: Kind; name?: string; accessUntil?: string; siteUrl?: string }

const COPY: Record<Kind, { title: string; body: (p: Props) => string; cta: string; path: string }> = {
  started: { title: 'Welcome to Practice/Prep', body: () => 'Your subscription is active. You now have unlimited simulations, interview prep and verified attempts for $15 USD a month.', cta: 'Start practising', path: '/dashboard' },
  payment_failed: { title: 'Your payment didn’t go through', body: () => 'We couldn’t take your monthly Practice/Prep payment. Please update your card within 7 days to keep unlimited practice.', cta: 'Update payment method', path: '/settings' },
  cancelled: { title: 'Your cancellation is confirmed', body: (p) => p.accessUntil ? `Your subscription won’t renew. You keep unlimited practice until ${p.accessUntil}.` : 'Your subscription has ended and won’t renew.', cta: 'View your plan', path: '/settings' },
}

export function BillingUpdateEmail({ kind = 'started', name, accessUntil, siteUrl = 'https://roleprove.com' }: Props) {
  const c = COPY[kind]
  return (
    <Html lang="en"><Head /><Preview>{c.title}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ padding: '24px 28px' }}>
          <Heading style={{ fontSize: '22px', color: '#1c2b27' }}>{c.title}</Heading>
          <Text style={{ fontSize: '15px', color: '#55575d', lineHeight: '1.5' }}>{name ? `Hi ${name},` : 'Hi,'}</Text>
          <Text style={{ fontSize: '15px', color: '#55575d', lineHeight: '1.5' }}>{c.body({ accessUntil })}</Text>
          <Button href={`${siteUrl}${c.path}`} style={{ backgroundColor: '#1f7a68', color: '#ffffff', borderRadius: '8px', padding: '12px 20px', fontSize: '15px' }}>{c.cta}</Button>
          <Text style={{ fontSize: '12px', color: '#999999', marginTop: '30px' }}>RoleProve · Practice/Prep billing</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BillingUpdateEmail,
  subject: (d: Record<string, any>) => COPY[(d.kind as Kind) ?? 'started'].title,
  displayName: 'Billing update',
  previewData: { kind: 'started', name: 'Ada' },
}
