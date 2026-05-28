import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"

type CurrencyCode = "gbp" | "usd" | "eur" | "cad"
type VoucherLevel = 1 | 2 | 3

type RewardsMetadata = {
  reward_points_balance?: number | string
  reward_points_earned_total?: number | string
  reward_points_redeemed_total?: number | string
  reward_lifetime_spend_gbp?: number | string
  reward_cashback_earned_total_gbp?: number | string
  lounge_plan?: "silver_access" | "gold_access" | null
  lounge_status?: "inactive" | "active" | "past_due" | "cancelled" | null
}

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
    voucher_level: level,
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

type DeductVoucherPointsStepInput = {
  customer_id: string
  current_metadata: RewardsMetadata
  points_to_deduct: number
}

type DeductVoucherPointsStepOutput = {
  remaining_points: number
  points_spent: number
}

type DeductVoucherPointsCompensationInput = {
  customer_id: string
  previous_metadata: RewardsMetadata
}

const deductVoucherPointsStep = createStep<
  DeductVoucherPointsStepInput,
  DeductVoucherPointsStepOutput,
  DeductVoucherPointsCompensationInput
>(
  "deduct-voucher-points-step",
  async (input, { container }) => {
    const customerModuleService = container.resolve(Modules.CUSTOMER)

    const currentMetadata = input.current_metadata || {}
    const currentPointsBalance = toNumber(currentMetadata.reward_points_balance)
    const currentRedeemedTotal = toNumber(
      currentMetadata.reward_points_redeemed_total
    )

    if (currentPointsBalance < input.points_to_deduct) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Insufficient reward points."
      )
    }

    const nextMetadata: RewardsMetadata = {
      ...currentMetadata,
      reward_points_balance: currentPointsBalance - input.points_to_deduct,
      reward_points_redeemed_total:
        currentRedeemedTotal + input.points_to_deduct,
    }

    await customerModuleService.updateCustomers(
      { id: input.customer_id },
      { metadata: nextMetadata }
    )

    return new StepResponse(
      {
        remaining_points: currentPointsBalance - input.points_to_deduct,
        points_spent: input.points_to_deduct,
      },
      {
        customer_id: input.customer_id,
        previous_metadata: currentMetadata,
      }
    )
  },
  async (compensationInput, { container }) => {
    if (!compensationInput?.customer_id) return

    const customerModuleService = container.resolve(Modules.CUSTOMER)

    await customerModuleService.updateCustomers(
      { id: compensationInput.customer_id },
      { metadata: compensationInput.previous_metadata || {} }
    )
  }
)

type CreateRewardVoucherPromotionStepInput = {
  customer_id: string
  voucher_level: VoucherLevel
  points_to_deduct: number
  voucher_value: number
  minimum_order_amount: number
  currency_code: CurrencyCode
}

type CreateRewardVoucherPromotionStepOutput = {
  promotion_id: string
  code: string
  voucher_level: VoucherLevel
  voucher_value: number
  minimum_order_amount: number
  currency_code: CurrencyCode
}

const createRewardVoucherPromotionStep = createStep<
  CreateRewardVoucherPromotionStepInput,
  CreateRewardVoucherPromotionStepOutput,
  string
>(
  "create-reward-voucher-promotion-step",
  async (input, { container }) => {
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
    })

    return new StepResponse(
      {
        promotion_id: promotion.id,
        code,
        voucher_level: input.voucher_level,
        voucher_value: input.voucher_value,
        minimum_order_amount: input.minimum_order_amount,
        currency_code: input.currency_code,
      },
      promotion.id
    )
  },
  async (promotionId, { container }) => {
    if (!promotionId) return

    const promotionModuleService = container.resolve(Modules.PROMOTION)
    await promotionModuleService.deletePromotions(promotionId)
  }
)

export const redeemVoucherRewardWorkflow = createWorkflow(
  "redeem-voucher-reward",
  (input: WorkflowInput) => {
    const voucherConfig = transform({ input }, ({ input }) =>
      getVoucherConfig(input.voucher_level, input.currency_code)
    )

    const deducted = deductVoucherPointsStep(
      transform({ input, voucherConfig }, ({ input, voucherConfig }) => ({
        customer_id: input.customer_id,
        current_metadata: input.current_metadata,
        points_to_deduct: voucherConfig.points_to_deduct,
      }))
    )

    const voucher = createRewardVoucherPromotionStep(
      transform({ input, voucherConfig }, ({ input, voucherConfig }) => ({
        customer_id: input.customer_id,
        voucher_level: voucherConfig.voucher_level,
        points_to_deduct: voucherConfig.points_to_deduct,
        voucher_value: voucherConfig.voucher_value,
        minimum_order_amount: voucherConfig.minimum_order_amount,
        currency_code: voucherConfig.currency_code,
      }))
    )

    const response = transform({ deducted, voucher }, ({ deducted, voucher }) => ({
      code: voucher.code,
      promotion_id: voucher.promotion_id,
      voucher_level: voucher.voucher_level,
      currency_code: voucher.currency_code,
      voucher_value: voucher.voucher_value,
      minimum_order_amount: voucher.minimum_order_amount,
      points_spent: deducted.points_spent,
      remaining_points: deducted.remaining_points,
    }))

    return new WorkflowResponse(response)
  }
)

export default redeemVoucherRewardWorkflow
