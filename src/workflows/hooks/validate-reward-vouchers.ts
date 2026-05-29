import {
  completeCartWorkflow,
  updateCartPromotionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { MedusaError } from "@medusajs/framework/utils"

type VoucherLevel = 1 | 2 | 3

const parseRewardVoucherLevel = (code?: string | null): VoucherLevel | null => {
  if (!code) return null

  const match = code.match(/^REWARD-L([123])-/i)

  if (!match) return null

  const level = Number(match[1])

  if (level === 1 || level === 2 || level === 3) {
    return level
  }

  return null
}

const getVoucherMinimumOrderGbp = (level: VoucherLevel) => {
  if (level === 1) return 20
  if (level === 2) return 40
  return 60
}

const convertFromGbp = (gbpValue: number, currencyCode?: string | null) => {
  const code = (currencyCode || "gbp").toLowerCase()

  if (code === "gbp") return gbpValue
  if (code === "usd") return Math.round(gbpValue * 1.28)
  if (code === "eur") return Math.round(gbpValue * 1.17)
  if (code === "cad") return Math.round(gbpValue * 1.73)

  return gbpValue
}

const getCartComparableAmount = (cart: any) => {
  const amountMinor =
    cart?.original_item_subtotal ??
    cart?.item_subtotal ??
    cart?.subtotal ??
    cart?.total ??
    0

  return amountMinor / 100
}

const validateRewardVoucherForCart = async (
  cartId: string,
  container: any,
  rewardCodes?: string[]
) => {
  if (!rewardCodes?.length) {
    return
  }

  const query = container.resolve("query")

  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "currency_code",
      "total",
      "subtotal",
      "item_subtotal",
      "original_item_subtotal",
      "customer_id",
      "promotions.code",
    ],
    filters: {
      id: cartId,
    },
  })

  if (!cart) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Cart not found."
    )
  }

  for (const code of rewardCodes) {
    const level = parseRewardVoucherLevel(code)

    if (!level) {
      continue
    }

    const minimumOrderInCurrency = convertFromGbp(
      getVoucherMinimumOrderGbp(level),
      cart.currency_code
    )

    const cartAmount = getCartComparableAmount(cart)

    if (cartAmount < minimumOrderInCurrency) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Reward voucher ${code} requires a minimum order of ${minimumOrderInCurrency} ${String(
          cart.currency_code || "gbp"
        ).toUpperCase()}.`
      )
    }
  }
}

updateCartPromotionsWorkflow.hooks.validate(
  async ({ input, cart }, { container }) => {
    const rewardCodes =
      input?.promo_codes?.filter((code) => parseRewardVoucherLevel(code)) || []

    if (!rewardCodes.length) {
      return
    }

    await validateRewardVoucherForCart(cart.id, container, rewardCodes)
  }
)

completeCartWorkflow.hooks.validate(
  async ({ cart }, { container }) => {
    const rewardCodes =
      cart?.promotions
        ?.map((promo: any) => promo?.code)
        ?.filter((code: string | undefined) => parseRewardVoucherLevel(code)) ||
      []

    if (!rewardCodes.length) {
      return
    }

    await validateRewardVoucherForCart(cart.id, container, rewardCodes)
  }
)
