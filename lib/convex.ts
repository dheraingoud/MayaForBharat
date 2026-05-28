import { ConvexReactClient } from "convex/react"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL as string

if (!convexUrl) {
  console.warn("NEXT_PUBLIC_CONVEX_URL not set — Convex queries will not work")
}

export const convex = new ConvexReactClient(
  convexUrl || "https://example.check.convex.cloud"
)
