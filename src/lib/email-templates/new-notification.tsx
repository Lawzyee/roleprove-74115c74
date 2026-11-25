import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { url?: string }

/** Deliberately carries no notification content: sign in to read it. */
export function NewNotificationEmail({ url }: Props) {
  const href = url || 'https://roleprove.com/inbox'
  return (
    <Html lang="en"><Head /><Preview>You have a new notification on RoleProve</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ padding: '24px 28px' }}>
          <Heading style={{ fontSize: '22px', color: '#1c2b27' }}>You have a new notification</Heading>
          <Text style={{ fontSize: '15px', color: '#55575d', lineHeight: '1.5' }}>There is a new notification in your RoleProve inbox. Sign in to read it.</Text>
          <Button href={href} style={{ backgroundColor: '#1f7a68', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', fontSize: '15px' }}>Open your inbox</Button>
          <Text style={{ fontSize: '12px', color: '#999999', marginTop: '30px' }}>You can change which notifications are emailed in Settings.</Text>
          <Text style={{ fontSize: '12px', color: '#999999', margin: '4px 0 0' }}>Questions? Contact <a href="mailto:support@roleprove.com" style={{ color: '#1f7a68' }}>support@roleprove.com</a></Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: NewNotificationEmail,
  subject: 'You have a new notification on RoleProve',
  displayName: 'New inbox notification',
  previewData: { url: 'https://roleprove.com/inbox' },
} satisfies TemplateEntry
