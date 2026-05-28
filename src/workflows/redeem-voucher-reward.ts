import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"

type CurrencyCode = "gbp" | "usd" | "eur" | "cad"

type RewardsMetadata = {
  reward_points_balance?: number | string
  reward_points_earned_total?: number | string
  reward_points_redeemed_total?: number | string
  reward_lifetime_spend_gbp?: number | string
  reward_cashback_earned_total_gbp?: number | string
  lounge_plan?: "silver_access" | "gold_access" | null
  lounge_status?: "inactive" | "active" | "past_due" | "cancelled" | null
}

type VoucherLevel = 1 | 2 | 3

type WorkflowInput = {
  customer_id: string
  current_metadata: RewardsMetadata
  voucher_level: VoucherLevel
  currency_code: CurrencyCode
}

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const convertFromGbp = (gbpValue: number, currencyCode: CurrencyCode) => {
  if (currencyCode === "gbp") return gbpValue
  if (currencyCode === "usd") return Math.round(gbpValue * 1.28)
  if (currencyCode === "eur") return Math.round(gbpValue * 1.17)
  if (currencyCode === "cad") return Math.round(gbpValue * 1.73)
  return gbpValue
}

const getVoucherConfig = (level: VoucherLevel, currencyCode: CurrencyCode) => {
  const base =
    level === 1
      ? { points: 100, valueGbp: 5, minOrderGbp: 20 }
      : level === 2
        ? { points: 200, valueGbp: 10, minOrderGbp: 40 }
        : { points: 300, valueGbp: 15, minOrderGbp: 60 }

  return {
    level,
    points_to_deduct: base.points,
    voucher_value: convertFromGbp(base.valueGbp, currencyCode),
    minimum_order_amount: convertFromGbp(base.minOrderGbp, currencyCode),
    currency_code: currencyCode,
  }
}

const generateVoucherCode = (level: VoucherLevel) => {
  const suffix = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`.toUpperCase()

  return `REWARD-L${level}-${suffix}`
}

type CreatePromotionStepInput = {
  customer_id: string
  voucher_level: VoucherLevel
  points_to_deduct: number
  voucher_value: number
  minimum_order_amount: number
  currency_code: CurrencyCode
}

const createRewardVoucherPromotionStep = createStep(
  "create-reward-voucher-promotion",
  async (input: CreatePromotionStepInput, { container }) => {
    const promotionModuleService = container.resolve(Modules.PROMOTION)

    const code = generateVoucherCode(input.voucher_level)

    const promotion = await promotionModuleService.createPromotions({
      code,
      type: "standard",
      status: "active",
      application_method: {
        type: "fixed",
        target_type: "order",
        allocation: "across",
        value: input.voucher_value,
        currency_code: input.currency_code,
      },
      rules: [
        {
          attribute: "customer_id",
          operator: "eq",
          values: [input.customer_id],
        },
      ],
      metadata: {
        reward_source: "loyalty_points",
        reward_voucher_level: String(input.voucher_level),
        reward_points_spent: String(input.points_to_deduct),
        reward_minimum_order_amount: String(input.minimum_order_amount),
        reward_currency_code: input.currency_code,
      },
    })

    return new StepResponse(
      {
        promotion,
        code,
      },
      promotion.id
    )
  },
  async (promotionId, { container }) => {
    if (!promotionId) {
      return
    }

    const promotionModuleService = container.resolve(Modules.PROMOTION)
    await promotionModuleService.deletePromotions(promotionId)
  }
)

type DeductPointsStepInput = {
  customer_id: string
  current_metadata: RewardsMetadata
  points_to_deduct: number
}

const deductVoucherPointsStep = createStep(
  "deduct-voucher-points",
  async (input: DeductPointsStepInput, { container }) => {
    const customerModuleService = container.resolve(Modules.CUSTOMER)

    const currentMetadata = input.current_metadata || {}
    const currentPointsBalance = toNumber(currentMetadata.reward_points_balance)
    const currentRedeemedTotal = toNumber(
      currentMetadata.reward_points_redeemed_total
    )

    if (currentPointsBalance < input.points_to_deduct) {
      throw new Error("Insufficient reward points.")
    }

    const nextMetadata: RewardsMetadata = {
      ...currentMetadata,
      reward_points_balance: currentPointsBalance - input.points_to_deduct,
      reward_points_redeemed_total:
        currentRedeemedTotal + input.points_to_deduct,
    }

    await customerModuleService.updateCustomers({
      id: input.customer_id,
      metadata: nextMetadata,
    })

    return new StepResponse(
      {
        remaining_points: currentPointsBalance - input.points_to_deduct,
      },
      {
        customer_id: input.customer_id,
        previous_metadata: currentMetadata,
      }
    )
  },
  async (compensationInput, { container }) => {
    if (!compensationInput?.customer_id) {
      return
    }

    const customerModuleService = container.resolve(Modules.CUSTOMER)

    await customerModuleService.updateCustomers({
      id: compensationInput.customer_id,
      metadata: compensationInput.previous_metadata || {},
    })
  }
)

export const redeemVoucherRewardWorkflow = createWorkflow(
  "redeem-voucher-reward",
  (input: WorkflowInput) => {
    const voucherInput = transform({ input }, ({ input }) => {
      return {
        customer_id: input.customer_id,
        voucher_level: input.voucher_level,
        ...getVoucherConfig(input.voucher_level, input.currency_code),
      }
    })

    const createdVoucher = createRewardVoucherPromotionStep(voucherInput)

    const deducted = deductVoucherPointsStep(
      transform({ input, voucherInput }, ({ input, voucherInput }) => ({
        customer_id: input.customer_id,
        current_metadata: input.current_metadata,
        points_to_deduct: voucherInput.points_to_deduct,
      }))
    )

    const response = transform(
      { createdVoucher, deducted, voucherInput },
      ({ createdVoucher, deducted, voucherInput }) => ({
        code: createdVoucher.code,
        promotion_id: createdVoucher.promotion.id,
        voucher_level: voucherInput.voucher_level,
        currency_code: voucherInput.currency_code,
        voucher_value: voucherInput.voucher_value,
        minimum_order_amount: voucherInput.minimum_order_amount,
        points_spent: voucherInput.points_to_deduct,
        remaining_points: deducted.remaining_points,
      })
    )

    return new WorkflowResponse(response)
  }
)

export default redeemVoucherRewardWorkflow
