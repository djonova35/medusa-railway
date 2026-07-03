// src/api/store/refund-request/route.ts
// -----------------------------------------------------
// Endpoint that receives refund requests from customers
// Saves the request to the order's metadata
// -----------------------------------------------------

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { IOrderModuleService } from "@medusajs/framework/types"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { order_id, reason } = req.body as {
    order_id?: string
    reason?: string
  }

  // Validate input
  if (!order_id) {
    res.status(400).json({
      success: false,
      error: "order_id is required",
    })
    return
  }

  if (!reason || reason.trim().length < 10) {
    res.status(400).json({
      success: false,
      error: "reason must be at least 10 characters",
    })
    return
  }

  try {
    const orderModuleService: IOrderModuleService = req.scope.resolve(
      Modules.ORDER
    )

    // Fetch the order
    const order = await orderModuleService.retrieveOrder(order_id)

    if (!order) {
      res.status(404).json({
        success: false,
        error: "Order not found",
      })
      return
    }

    // Check if refund already requested
    if (order.metadata?.refund_status) {
      res.status(400).json({
        success: false,
        error: "A refund request already exists for this order",
      })
      return
    }

    // Save the refund request to order metadata
    await orderModuleService.updateOrders(order_id, {
      metadata: {
        ...(order.metadata || {}),
        refund_status: "pending",
        refund_reason: reason.trim(),
        refund_requested_at: new Date().toISOString(),
      },
    })

    console.log(
      `[RefundRequest] ✅ Saved refund request for order ${order_id}`
    )

    res.status(200).json({
      success: true,
      message: "Refund request submitted successfully",
    })
  } catch (error: any) {
    console.error("[RefundRequest] Error:", error?.message)
    res.status(500).json({
      success: false,
      error: error?.message || "Internal server error",
    })
  }
}
