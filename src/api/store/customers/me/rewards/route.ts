import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

type TierKey = "bronze" | "silver" | "gold"
type LoungePlan = "silver_access" | "gold_access" | null
type LoungeStatus = "inactive" | "active" | "past_due" | "cancelled" | null

type RewardsMetadata = {
  reward_points_balance?: number | string
  reward_points_earned_total?: number | string
  reward_points_redeemed_total?: number | string
  reward_lifetime_spend_gbp?: number | string
  lounge_plan?: LoungePlan
  lounge_status?: LoungeStatus
}

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
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

const getCashbackLabel = (tier: TierKey) => {
  if (tier === "gold") return "10% cashback"
  if (tier === "silver") return "7% cashback"
  return "5% cashback"
}

const getPointsLabel = (tier: TierKey) => {
  if (tier === "gold") return "2 points per £1 spent"
  if (tier === "silver") return "1.5 points per £1 spent"
  return "1 point per £1 spent"
}

const buildVoucherLevels = (pointsBalance: number) => {
  const levels = [
    {
      level: 1,
      points_required: 100,
      voucher_value_gbp: 5,
      minimum_order_gbp: 20,
    },
    {
      level: 2,
      points_required: 200,
      voucher_value_gbp: 10,
      minimum_order_gbp: 40,
    },
    {
      level: 3,
      points_required: 300,
      voucher_value_gbp: 15,
      minimum_order_gbp: 60,
    },
  ]

  return levels.map((level) => ({
    ...level,
    unlocked: pointsBalance >= level.points_required,
    points_to_unlock: Math.max(level.points_required - pointsBalance, 0),
  }))
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customerId = req.auth_context?.actor_id

  if (!customerId) {
    return res.status(401).json({
      message: "You must be signed in to view rewards.",
    })
  }

  const query = req.scope.resolve("query")

  const {
    data: [customer],
  } = await query.graph(
    {
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name", "metadata"],
      filters: {
        id: customerId,
      },
    },
    {
      throwIfKeyNotFound: true,
    }
  )

  const metadata = ((customer.metadata || {}) as RewardsMetadata) ?? {}

  const lifetimeSpendGbp = toNumber(metadata.reward_lifetime_spend_gbp)
  const pointsBalance = toNumber(metadata.reward_points_balance)
  const pointsEarnedTotal = toNumber(metadata.reward_points_earned_total)
  const pointsRedeemedTotal = toNumber(metadata.reward_points_redeemed_total)

  const loungePlan: LoungePlan = metadata.lounge_plan || null
  const loungeStatus: LoungeStatus = metadata.lounge_status || "inactive"

  const naturalTier = getNaturalTier(lifetimeSpendGbp)
  const effectiveTier = getEffectiveTier(
    naturalTier,
    loungePlan,
    loungeStatus
  )

  const cashbackRate = getCashbackRate(effectiveTier)
  const pointsRate = getPointsRate(effectiveTier)

  return res.json({
    rewards: {
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
      },
      natural_tier: naturalTier,
      effective_tier: effectiveTier,
      cashback_rate: cashbackRate,
      cashback_label: getCashbackLabel(effectiveTier),
      points_rate: pointsRate,
      points_label: getPointsLabel(effectiveTier),
      lifetime_spend_gbp: lifetimeSpendGbp,
      points_balance: pointsBalance,
      points_earned_total: pointsEarnedTotal,
      points_redeemed_total: pointsRedeemedTotal,
      member_lounge: {
        plan: loungePlan,
        status: loungeStatus,
      },
      vouchers: buildVoucherLevels(pointsBalance),
    },
  })
}
