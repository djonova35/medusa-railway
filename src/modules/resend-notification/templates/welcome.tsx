import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Hr,
} from "@react-email/components"
import * as React from "react"

type WelcomeEmailProps = {
  customer_name?: string
}

export const welcomeEmail = (props: unknown) => {
  const { customer_name = "there" } = props as WelcomeEmailProps

  return (
    <Html>
      <Head />
      <Preview>Welcome to DJONOVA</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome to DJONOVA</Heading>

          <Text style={paragraph}>Hi {customer_name},</Text>

          <Text style={paragraph}>
            Thanks for joining us. We are glad to have you.
          </Text>

          <Text style={paragraph}>
            Have a look around the store and let us know if you need anything.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>— The DJONOVA Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#f6f6f6",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "600px",
}

const heading = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#000",
  marginBottom: "16px",
}

const paragraph = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#333",
}

const hr = {
  borderColor: "#e6e6e6",
  margin: "20px 0",
}

const footer = {
  fontSize: "14px",
  color: "#666",
  marginTop: "8px",
}

export default welcomeEmail
