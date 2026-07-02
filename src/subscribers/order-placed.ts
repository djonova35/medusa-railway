import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { INotificationModuleService, IOrderModuleService } from "@medusajs/framework/types"

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION
  )
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  // Fetch the order details
  const order = await orderModuleService.retrieveOrder(data.id, {
    relations: ["items"],
  })

  if (!order.email) {
    console.warn(`Order ${data.id} has no email, skipping notification`)
    return
  }

  // Format order items for the email
  const items = order.items?.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    unit_price: `${(Number(item.unit_price) / 100).toFixed(2)}`,
  }))

  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: "email",
      template: "order-placed",
      data: {
        customer_name: order.shipping_address?.first_name || "there",
        order_id: order.display_id?.toString() || order.id,
        order_total: (Number(order.total) / 100).toFixed(2),
        currency_code: order.currency_code,
        items,
      },
    })
  } catch (error) {
    console.error(`Failed to send order placed email: ${error}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
