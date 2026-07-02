import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components"
import * as React from "react"

// -------------------------------------------------------
// Data passed in when triggering this email
// -------------------------------------------------------
type OrderPlacedEmailProps = {
  customer_name?: string
  order_id: string
  order_total: string
  currency_code: string
  items?: Array<{
    title: string
    quantity: number
    unit_price: string
  }>
}

export const orderPlacedEmail = (props: unknown) => {
  const {
    customer_name = "there",
    order_id,
    order_total,
    currency_code,
    items = [],
  } = props as OrderPlacedEmailProps

  return (
    <Html>
      <Head />
      <Preview>Thank you for your order at DJONOVA</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Thank you for your order</Heading>

          <Text style={paragraph}>Hi {customer_name},</Text>

          <Text style={paragraph}>
            We have received your order and are getting it ready. You will
            receive another email when it ships.
          </Text>

          <Hr style={hr} />

          <Section>
            <Text style={detailLabel}>Order Number</Text>
            <Text style={detailValue}>{order_id}</Text>
          </Section>

          {items.length > 0 && (
            <>
              <Hr style={hr} />
              <Section>
                <Text style={detailLabel}>Items</Text>
                {items.map((item, i) => (
                  <Text key={i} style={itemLine}>
                    {item.quantity} × {item.title} — {item.unit_price}
                  </Text>
                ))}
              </Section>
            </>
          )}

          <Hr style={hr} />

          <Section>
            <Text style={detailLabel}>Order Total</Text>
            <Text style={totalValue}>
              {order_total} {currency_code.toUpperCase()}
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            If you have any questions, just reply to this email.
          </Text>
          <Text style={footer}>— The DJONOVA Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

// -------------------------------------------------------
// Styles
// -------------------------------------------------------
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

const detailLabel = {
  fontSize: "14px",
  color: "#666",
  marginBottom: "4px",
}

const detailValue = {
  fontSize: "16px",
  color: "#000",
  fontWeight: "600",
}

const itemLine = {
  fontSize: "14px",
  color: "#333",
  margin: "4px 0",
}

const totalValue = {
  fontSize: "20px",
  color: "#000",
  fontWeight: "bold",
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

export default orderPlacedEmail
