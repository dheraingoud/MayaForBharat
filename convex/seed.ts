import { mutation } from "./_generated/server"
import { v } from "convex/values"

/**
 * Seeds demo data for the MAYA hackathon demo.
 * Idempotent: skips if demo trader already exists.
 */
export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const CLERK_USER_ID = "user_demo_trader_001"

    // Check if already seeded
    const existing = await ctx.db
      .query("traders")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", CLERK_USER_ID))
      .unique()

    if (existing) {
      const existingApp = await ctx.db
        .query("apps")
        .withIndex("by_trader", (q) => q.eq("traderId", existing._id))
        .first()
      return {
        seeded: false,
        message: "Demo data already exists",
        traderId: existing._id,
        appId: existingApp?._id ?? null,
      }
    }

    // ── 1. Demo Trader ────────────────────────────
    const traderId = await ctx.db.insert("traders", {
      clerkUserId: CLERK_USER_ID,
      name: "Ravi Sharma",
      phone: "+919876543210",
      createdAt: Date.now(),
    })

    // ── 2. Demo App ───────────────────────────────
    const appId = await ctx.db.insert("apps", {
      traderId,
      name: "Sharma Kirana",
      nameHindi: "शर्मा कीराना",
      descriptionHindi:
        "आपके मोबाइल पर एक छोटी-सी दुकान — सब सुविधाएँ, एक जगह।",
      specJson: JSON.stringify({
        sections: ["hero", "categories", "products", "cart", "checkout"],
        theme: "kirana-dark",
        features: ["voice-search", "whatsapp-order", "loyalty-points"],
      }),
      status: "live",
      templateFamily: "kirana",
      evolutionCount: 2,
      lastEvolvedAt: Date.now() - 24 * 60 * 60 * 1000,
      createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    })

    // ── 3. Demo Improvements ──────────────────────
    const now = Date.now()
    const days = (n: number) => n * 24 * 60 * 60 * 1000
    const hours = (n: number) => n * 60 * 60 * 1000

    // merged: Search feature (3 days ago)
    const searchId = await ctx.db.insert("improvements", {
      appId,
      titleHindi: "सर्च फीचर जोड़ा गया",
      titleEn: "Search feature added",
      category: "new_feature",
      status: "merged",
      proposedAt: now - days(3) - hours(2),
      mergedAt: now - days(2),
    })

    // pending_approval: Stock alert system (2 hours ago)
    const stockId = await ctx.db.insert("improvements", {
      appId,
      titleHindi: "स्टॉक अलर्ट सिस्टम",
      titleEn: "Stock alert system",
      category: "new_feature",
      status: "pending_approval",
      proposedAt: now - hours(2),
    })

    // gate_failed: SMS integration (failed at build gate)
    const smsId = await ctx.db.insert("improvements", {
      appId,
      titleHindi: "एसएमएस इंटीग्रेशन",
      titleEn: "SMS integration",
      category: "logic_fix",
      status: "gate_failed",
      failedGate: "build",
      proposedAt: now - days(1),
    })

    // ── 4. Demo Evolution Log Entries ─────────────
    const yesterday3am = now - days(1) + 3 * 60 * 60 * 1000

    // dream
    await ctx.db.insert("evolutionLog", {
      appId,
      message:
        "रात 3 बजे MAYA ने लॉग्स का विश्लेषण किया — 3 नए सुधार पहचाने गए।",
      messageEn:
        "While sleeping, MAYA analyzed logs and identified 3 new improvement opportunities.",
      type: "dream",
      createdAt: yesterday3am,
    })

    // improvement for search feature
    await ctx.db.insert("evolutionLog", {
      appId,
      message:
        "सर्च फीचर लाइव — अब ग्राहक प्रोडक्ट खोज सकते हैं।",
      messageEn: "Search feature went live — customers can now find products.",
      type: "improvement",
      createdAt: yesterday3am + 20 * 60 * 1000,
    })

    // observation
    await ctx.db.insert("evolutionLog", {
      appId,
      message:
        "ग्राहक 'Add to Cart' पर 'Buy Now' की तुलना में 3x ज़्यादा क्लिक करते हैं।",
      messageEn:
        "Users click Add to Cart 3x more than Buy Now.",
      type: "observation",
      createdAt: yesterday3am + 40 * 60 * 1000,
    })

    // gate_fail for SMS integration
    await ctx.db.insert("evolutionLog", {
      appId,
      message:
        "SMS इंटीग्रेशन बिल्ड गेट पर फेल — dependency missing।",
      messageEn:
        "SMS integration failed at build gate: missing twilio dependency.",
      type: "gate_fail",
      createdAt: yesterday3am + 60 * 60 * 1000,
    })

    // improvement for a previous change
    await ctx.db.insert("evolutionLog", {
      appId,
      message:
        "लोयल्टी पॉइंट सिस्टम अपडेट — अब ग्राहक हर ₹100 पर 5 पॉइंट कमाते हैं।",
      messageEn:
        "Loyalty points system updated — customers earn 5 points per ₹100.",
      type: "improvement",
      createdAt: yesterday3am + 90 * 60 * 1000,
    })

    return {
      seeded: true,
      traderId,
      appId,
      improvements: { search: searchId, stock: stockId, sms: smsId },
    }
  },
})
