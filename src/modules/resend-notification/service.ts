import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { Resend, CreateEmailOptions } from "resend"
import { ReactNode } from "react"
import { orderPlacedEmail } from "./templates/order-placed"
import { welcomeEmail } from "./templates/welcome"

// -------------------------------------------------------
// Options passed to this module from medusa-config.ts
// -------------------------------------------------------
type ResendOptions = {
  api_key: string
  from: string
}

// -------------------------------------------------------
// Injected dependencies (Medusa gives us the logger)
// -------------------------------------------------------
type InjectedDependencies = {
  logger: Logger
}

// -------------------------------------------------------
// Template registry
// Maps a template name (string) to a React email component
// Add new templates here as you create them
// -------------------------------------------------------
enum Templates {
  ORDER_PLACED = "order-placed",
  WELCOME = "welcome",
}

const templates: { [key in Templates]?: (props: unknown) => ReactNode } = {
  [Templates.ORDER_PLACED]: orderPlacedEmail,
  [Templates.WELCOME]: welcomeEmail,
}

// -------------------------------------------------------
// The Notification Service
// -------------------------------------------------------
class ResendNotificationService extends AbstractNotificationProviderService {
  static identifier = "resend-notification"

  private resendClient: Resend
  private options: ResendOptions
  private logger: Logger

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()

    this.resendClient = new Resend(options.api_key)
    this.options = options
    this.logger = logger
  }

  // Validate module options on startup
  static validateOptions(options: Record<string, unknown>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Resend API key is required in notification module options"
      )
    }
    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A 'from' email address is required in notification module options"
      )
    }
  }

  // -------------------------------------------------------
  // Main send method — called by Medusa when a notification
  // event fires
  // -------------------------------------------------------
  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    if (!notification) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No notification information provided"
      )
    }

    const template = templates[notification.template as Templates]

    if (!template) {
      this.logger.error(
        `No template found for notification: ${notification.template}`
      )
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Template "${notification.template}" not found`
      )
    }

    // Build the email payload
    const emailOptions: CreateEmailOptions = {
      from: this.options.from,
      to: [notification.to],
      subject: this.getSubject(notification.template as Templates),
      react: template(notification.data),
    }

    try {
      const { data, error } = await this.resendClient.emails.send(emailOptions)

      if (error) {
        this.logger.error(
          `Failed to send email via Resend: ${error.message}`
        )
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `Resend error: ${error.message}`
        )
      }

      this.logger.info(
        `✅ Email sent successfully to ${notification.to} | Template: ${notification.template} | Resend ID: ${data?.id}`
      )

      return { id: data?.id }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Resend send failed: ${message}`)
      throw error
    }
  }

  // -------------------------------------------------------
  // Determine the email subject line based on template
  // -------------------------------------------------------
  private getSubject(template: Templates): string {
    switch (template) {
      case Templates.ORDER_PLACED:
        return "Thank you for your order at DJONOVA"
      case Templates.WELCOME:
        return "Welcome to DJONOVA"
      default:
        return "A message from DJONOVA"
    }
  }
}

export default ResendNotificationService
