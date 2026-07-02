import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { INotificationModuleService, ICustomerModuleService } from "@medusajs/framework/types"

export default async function customerCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION
  )
  const customerModuleService: ICustomerModuleService = container.resolve(
    Modules.CUSTOMER
  )

  const customer = await customerModuleService.retrieveCustomer(data.id)

  if (!customer.email) {
    console.warn(`Customer ${data.id} has no email, skipping welcome`)
    return
  }

  try {
    await notificationModuleService.createNotifications({
      to: customer.email,
      channel: "email",
      template: "welcome",
      data: {
        customer_name: customer.first_name || "there",
      },
    })
  } catch (error) {
    console.error(`Failed to send welcome email: ${error}`)
  }
}

export const config: SubscriberConfig = {
  event: "customer.created",
}
