import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { MedusaError } from "@medusajs/framework/utils"
import redeemVoucherRewardWorkflow from "../../../../../../workflows/redeem-voucher-reward"

export const PostStoreRedeemVoucherSchema = z.object({
  voucher_level: z.preprocess(
    (val) => {
      if (typeof val === "string") return Number(val)
      return val
    },
    z.union([z.literal(1), z.literal(2), z.literal(3)])
  ),
  currency_code: z
    .enum(["gbp", "usd", "eur", "cad"])
    .default("gbp"),
})

type PostStoreRedeemVoucherBody = z.infer<
  typeof PostStoreRedeemVoucherSchema
>

export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreRedeemVoucherBody>,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Customer authentication is required."
    )
  }

  const { voucher_level, currency_code } = req.validatedBody

  const query = req.scope.resolve("query")

  const {
    data: [customer],
  } = await query.graph(
    {
      entity: "customer",
      fields: ["id", "metadata"],
      filters: {
        id: customerId,
      },
    },
    {
      throwIfKeyNotFound: true,
    }
  )

  const { result } = await redeemVoucherRewardWorkflow(req.scope).run({
    input: {
      customer_id: customerId,
      current_metadata: (customer.metadata || {}) as Record<string, unknown>,
      voucher_level,
      currency_code,
    },
  })

  return res.status(200).json({
    voucher: result,
  })
}
