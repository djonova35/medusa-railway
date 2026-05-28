import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { awardRewardsFromOrderWorkflow } from "../workflows/award-rewards-from-order"

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await awardRewardsFromOrderWorkflow(container).run({
    input: {
      order_id: data.id,
    },
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
