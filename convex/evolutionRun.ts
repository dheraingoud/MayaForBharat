import { internalAction } from "./_generated/server"
import { evolutionRunHandler } from "./evolutionRunHandler"

export const evolutionRun = internalAction({
  args: {},
  handler: evolutionRunHandler,
})
