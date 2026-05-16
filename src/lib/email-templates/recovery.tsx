import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Reset your {siteName} password — this link is single-use and expires soon.
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Reset your {siteName} password</Heading>

        <Text style={text}>
          We received a request to reset the password for your {siteName} account.
          Click the button below to choose a new password.
        </Text>

        <Section style={{ textAlign: 'center', margin: '0 0 28px' }}>
          <Button style={button} href={confirmationUrl}>
            Reset password
          </Button>
        </Section>

        <Section style={callout}>
          <Text style={calloutTitle}>A few things to know</Text>
          <Text style={calloutItem}>
            • <strong>Single-use link.</strong> Once you open it and set a new
            password, the link stops working. You can't use it twice.
          </Text>
          <Text style={calloutItem}>
            • <strong>Expires shortly.</strong> For your security, the link is
            valid for a limited time (typically about an hour). After that
            you'll need to request a new one.
          </Text>
          <Text style={calloutItem}>
            • <strong>One active link at a time.</strong> Requesting a new
            reset link invalidates any previous links for your account.
          </Text>
        </Section>

        <Text style={text}>
          If the button doesn't work, copy and paste this URL into your browser:
        </Text>
        <Text style={urlText}>{confirmationUrl}</Text>

        <Hr style={hr} />

        <Text style={footer}>
          Didn't request this? You can safely ignore this email — your password
          won't change unless you open the link above and set a new one. If you
          keep receiving unexpected reset emails, please contact {siteName}{' '}
          support so we can help secure your account.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const urlText = {
  fontSize: '12px',
  color: '#55575d',
  lineHeight: '1.5',
  wordBreak: 'break-all' as const,
  margin: '0 0 24px',
  fontFamily: 'Courier, monospace',
}
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
  display: 'inline-block',
}
const callout = {
  backgroundColor: '#f6f7f9',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '0 0 24px',
}
const calloutTitle = {
  fontSize: '12px',
  fontWeight: 'bold' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: '#000000',
  margin: '0 0 10px',
}
const calloutItem = {
  fontSize: '13px',
  color: '#55575d',
  lineHeight: '1.55',
  margin: '0 0 8px',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = {
  fontSize: '12px',
  color: '#999999',
  lineHeight: '1.5',
  margin: '0',
}
