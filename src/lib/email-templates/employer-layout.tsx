import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text } from '@react-email/components'

export const p = { fontSize: '15px', color: '#55575d', lineHeight: '1.5' }
export function EmployerEmail({ preview, title, children, action, removeLabel, removeUrl }: {
  preview: string; title: string; children: React.ReactNode; action?: { label: string; url?: string }; removeLabel?: string; removeUrl?: string
}) {
  return (
    <Html lang="en"><Head /><Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ padding: '24px 28px' }}>
          <Heading style={{ fontSize: '22px', color: '#1c2b27' }}>{title}</Heading>
          {children}
          {action?.url && <Button href={action.url} style={{ backgroundColor: '#1f7a68', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', fontSize: '15px' }}>{action.label}</Button>}
          {removeUrl && <Text style={{ fontSize: '13px', color: '#55575d', marginTop: '24px' }}><Link href={removeUrl} style={{ color: '#1f7a68' }}>{removeLabel}</Link></Text>}
          <Text style={{ fontSize: '12px', color: '#999999', marginTop: '30px' }}>RoleProve · For employers</Text>
          <Text style={{ fontSize: '12px', color: '#999999', margin: '4px 0 0' }}>Questions? Contact <a href="mailto:support@roleprove.com" style={{ color: '#1f7a68' }}>support@roleprove.com</a></Text>
        </Container>
      </Body>
    </Html>
  )
}
