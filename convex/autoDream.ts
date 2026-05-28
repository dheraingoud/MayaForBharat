import { internalAction } from "./_generated/server"
import { autoDreamHandler } from "./autoDreamHandler"

export const autoDream = internalAction({
  args: {},
  handler: autoDreamHandler,
})
