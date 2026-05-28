// @ts-nocheck

import { internalAction } from "./_generated/server"
import { autoApproveHandler } from "./autoApproveHandler"

export const autoApprove = internalAction({
  args: {},
  handler: autoApproveHandler,
})
