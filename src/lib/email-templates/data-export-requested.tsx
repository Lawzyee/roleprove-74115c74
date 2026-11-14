import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { requestedAt?: string }

export function DataExportRequestedEmail({ requestedAt }: Props) {
  return (
    <Html lang="en"><Head /><Preview>An export of your data was requested</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ padding: '24px 28px' }}>
          <Heading style={{ fontSize: '22px', color: '#1c2b27' }}>An export of your data was requested</Heading>
          <Text style={{ fontSize: '15px', color: '#55575d', lineHeight: '1.5' }}>
            {requestedAt ? `On ${requestedAt}, someone` : 'Someone'} signed in to your RoleProve account, confirmed the password and requested a copy of all your data. The download is only available in that signed-in session and its link expires after 1 hour.
          </Text>
          <Text style={{ fontSize: '15px', color: '#55575d', lineHeight: '1.5' }}>
            If this was you, there is nothing else to do. If it wasn’t, change your password straight away and contact us.
          </Text>
          <Text style={{ fontSize: '12px', color: '#999999', marginTop: '30px' }}>RoleProve · Account security</Text>
          <Text style={{ fontSize: '12px', color: '#999999', margin: '4px 0 0' }}>Questions? Contact <a href="mailto:support@roleprove.com" style={{ color: '#1f7a68' }}>support@roleprove.com</a></Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DataExportRequestedEmail,
  subject: 'An export of your data was requested',
  displayName: 'Data export requested',
  previewData: { requestedAt: 'Sat, 14 Nov 2026 21:30:00 GMT' },
} satisfies TemplateEntry
