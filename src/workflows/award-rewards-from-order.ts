import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

type TierKey = "bronze" | "silver" | "gold"
type LoungePlan = "silver_access" | "gold_access" | null
type LoungeStatus = "inactive" | "active" | "past_due" | "cancelled" | null

type RewardsMetadata = {
  reward_points_balance?: number | string
  reward_points_earned_total?: number | string
  reward_points_redeemed_total?: number | string
  reward_lifetime_spend_gbp?: number | string
  reward_cashback_earned_total_gbp?: number | string
  lounge_plan?: LoungePlan
  lounge_status?: LoungeStatus
}

type AwardRewardsStepInput = {
  customer_id: string | null
  current_metadata: RewardsMetadata
  order_total: number
  currency_code: string
}

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const round2 = (value: number) => {
  return Math.round(value * 100) / 100
}

const convertOrderAmountToGbp = (amountMajor: number, currencyCode: string) => {
  const code = currencyCode.toUpperCase()

  if (code === "GBP") return amountMajor
  if (code === "USD") return amountMajor / 1.28
  if (code === "EUR") return amountMajor / 1.17
  if (code === "CAD") return amountMajor / 1.73

  // Safe fallback: if unsupported currency appears, treat as GBP-equivalent
  return amountMajor
}

const getNaturalTier = (lifetimeSpendGbp: number): TierKey => {
  if (lifetimeSpendGbp >= 300) return "gold"
  if (lifetimeSpendGbp >= 100) return "silver"
  return "bronze"
}

const getEffectiveTier = (
  naturalTier: TierKey,
  loungePlan: LoungePlan,
  loungeStatus: LoungeStatus
): TierKey => {
  if (loungeStatus !== "active") {
    return naturalTier
  }

  if (naturalTier === "gold") {
    return "gold"
  }

  if (loungePlan === "gold_access") {
    return "gold"
  }

  if (loungePlan === "silver_access") {
    return naturalTier === "bronze" ? "silver" : naturalTier
  }

  return naturalTier
}

const getCashbackRate = (tier: TierKey) => {
  if (tier === "gold") return 0.1
  if (tier === "silver") return 0.07
  return 0.05
}

const getPointsRate = (tier: TierKey) => {
  if (tier === "gold") return 2
  if (tier === "silver") return 1.5
  return 1
}

const awardRewardsStep = createStep(
  "award-rewards-step",
  async (input: AwardRewardsStepInput, { container }) => {
    if (!input.customer_id) {
      return new StepResponse({
        skipped: true,
        reason: "Order has no customer_id",
      })
    }

    const customerModuleService = container.resolve(Modules.CUSTOMER)

    const currentMetadata = input.current_metadata || {}

    const currentPointsBalance = toNumber(currentMetadata.reward_points_balance)
    const currentPointsEarnedTotal = toNumber(
      currentMetadata.reward_points_earned_total
    )
    const currentLifetimeSpendGbp = toNumber(
      currentMetadata.reward_lifetime_spend_gbp
    )
    const currentCashbackEarnedTotalGbp = toNumber(
      currentMetadata.reward_cashback_earned_total_gbp
    )

    const loungePlan: LoungePlan = currentMetadata.lounge_plan || null
    const loungeStatus: LoungeStatus = currentMetadata.lounge_status || "inactive"

    const orderTotalMajor = input.order_total / 100
    const orderTotalGbp = round2(
      convertOrderAmountToGbp(orderTotalMajor, input.currency_code)
    )

    const nextLifetimeSpendGbp = round2(currentLifetimeSpendGbp + orderTotalGbp)

    const naturalTier = getNaturalTier(nextLifetimeSpendGbp)
    const effectiveTier = getEffectiveTier(
      naturalTier,
      loungePlan,
      loungeStatus
    )

    const cashbackRate = getCashbackRate(effectiveTier)
    const pointsRate = getPointsRate(effectiveTier)

    const cashbackEarnedGbp = round2(orderTotalGbp * cashbackRate)
    const pointsEarned = Math.round(orderTotalGbp * pointsRate)

    const nextMetadata: RewardsMetadata = {
      ...currentMetadata,
      reward_points_balance: currentPointsBalance + pointsEarned,
      reward_points_earned_total: currentPointsEarnedTotal + pointsEarned,
      reward_lifetime_spend_gbp: nextLifetimeSpendGbp,
      reward_cashback_earned_total_gbp: round2(
        currentCashbackEarnedTotalGbp + cashbackEarnedGbp
      ),
    }

    await customerModuleService.updateCustomers({
      id: input.customer_id,
      metadata: nextMetadata,
    })

    return new StepResponse(
      {
        customer_id: input.customer_id,
        points_earned: pointsEarned,
        cashback_earned_gbp: cashbackEarnedGbp,
        effective_tier: effectiveTier,
        natural_tier: naturalTier,
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

type WorkflowInput = {
  order_id: string
}

export const awardRewardsFromOrderWorkflow = createWorkflow(
  "award-rewards-from-order",
  ({ order_id }: WorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id",
        "total",
        "currency_code",
        "customer.id",
        "customer.metadata",
      ],
      filters: {
        id: order_id,
      },
    }).config({ name: "fetch-order-for-rewards" })

    const rewardsInput = transform({ orders }, (data) => {
      const order = Array.isArray(data.orders) ? data.orders[0] : data.orders

      return {
        customer_id: order?.customer?.id || null,
        current_metadata: (order?.customer?.metadata || {}) as RewardsMetadata,
        order_total: order?.total || 0,
        currency_code: order?.currency_code || "gbp",
      }
    })

    const result = awardRewardsStep(rewardsInput)

    return new WorkflowResponse(result)
  }
)

export default awardRewardsFromOrderWorkflow
