import {
  authenticate,
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { PostStoreRedeemVoucherSchema } from "./store/customers/me/rewards/redeem-voucher/route"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/customers/me/rewards/redeem-voucher",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(PostStoreRedeemVoucherSchema),
      ],
    },
  ],
})
