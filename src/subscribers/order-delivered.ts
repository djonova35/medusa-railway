// src/subscribers/order-delivered.ts
// -----------------------------------------------------
// Fires when an order is marked as "delivered" in Medusa Admin
// Saves the delivery timestamp to the order metadata
// The frontend uses this to calculate the 14-day return window
// -----------------------------------------------------

import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { IOrderModuleService } from "@medusajs/framework/types"

export default async function orderDeliveredHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  console.log(`[OrderDelivered] Handler triggered for order ${data.id}`)

  const orderModuleService: IOrderModuleService = container.resolve(
    Modules.ORDER
  )

  try {
    // Fetch the current order
    const order = await orderModuleService.retrieveOrder(data.id)

    // Only save delivery date if not already set (avoids overwriting)
    if (order.metadata?.delivered_at) {
      console.log(
        `[OrderDelivered] Order ${data.id} already has delivery date, skipping`
      )
      return
    }

    // Save delivery timestamp to the order's metadata
    await orderModuleService.updateOrders(data.id, {
      metadata: {
        ...(order.metadata || {}),
        delivered_at: new Date().toISOString(),
      },
    })

    console.log(
      `[OrderDelivered] ✅ Saved delivery date for order ${data.id}`
    )
  } catch (error) {
    console.error(
      `[OrderDelivered] ❌ Failed for order ${data.id}:`,
      error
    )
  }
}

export const config: SubscriberConfig = {
  event: "delivery.created",
}
