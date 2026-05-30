/**
 * MAYA Business Prompt Templates
 *
 * Per-business prompts for intent extraction, builder, proposer, observer.
 * Pure functions — no circular imports. Agents call getPrompts(category)
 * to get the correct template for that business type.
 *
 * Categories: kirana | tailor | dairy | pharmacy | electronics | restaurant | other
 */

export const MAYA_REGISTRY = `
COMPONENT GUIDE:
DO NOT import from "@/components/ui/*" — those files do not exist.
Instead, build all UI components inline using standard HTML elements + Tailwind CSS classes:
- Button: <button className="px-4 py-2 rounded-xl bg-primary text-white hover:opacity-90 transition-all">
- Card: <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-md shadow-lg p-6">
- Input: <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary outline-none" />
- Badge: <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
- Table: <table className="w-full"><thead><tr className="border-b"><th className="text-left p-3 text-sm font-medium text-gray-500">
All components MUST be self-contained inline code. Never reference external component libraries.
`

export const STACK_CONTRACT = `
STACK CONTRACT (CRITICAL):
- Next.js 15 App Router
- React 19 (use server/client)
- Tailwind CSS
- Lucide React icons
`

export type BusinessCategory =
  | 'kirana'
  | 'tailor'
  | 'dairy'
  | 'pharmacy'
  | 'electronics'
  | 'restaurant'
  | 'other'

export interface PromptTemplate {
  category: BusinessCategory
  /** Business-specific intent extraction hint for the NIM model in voice-pipeline */
  intentHint: string
  /** Business-specific builder system prompt additions */
  builderContext: string
  /** Business-specific observer checks */
  observerContext: string
  /** Business-specific proposer examples */
  proposerExamples: string
  /** Suggested pages/features for this business */
  suggestedPages: string[]
  /** Suggested data fields for this business */
  dataFieldHints: { name: string; type: string }[]
}

// ─── Intent Extraction Hints ────────────────────────────────────────────────
// These give the NIM model context about what each business type means.

const INTENT_HINTS: Record<BusinessCategory, string> = {
  kirana: `किराने की दुकान (kirana shop). Sells daily groceries, snacks, household items.
Key fields: stock/inventory, barcode (optional), unit, price per unit, supplier name.
Font: Hindi labels, numbers in Arabic.
User type: shop owner.`,

  tailor: `दर्जी की दुकान (tailoring). Suits, alterations, measurements, fittings.
Key fields: customer measurements (neck, chest, waist, length), order date, due date, fabric, style.
Font: Hindi labels, measurements in cm/inches.
User type: tailor.`,

  dairy: `दूधवाला / dairy stall. Milk, curd, butter, ghee daily orders.
Key fields: customer (name + address), quantity (litre/kg), delivery date, morning/evening shift.
Font: Hindi labels, numbers in Arabic.
User type: dairy seller.`,

  pharmacy: `दवा की दुकान (pharmacy). Medicines, prescriptions, stock alerts.
Key fields: medicine name, generic name, batch number, expiry date, mrp, stock qty, doctor name.
Font: Hindi labels, medical terms in English.
User type: chemist/pharmacist.`,

  electronics: `इलेक्ट्रॉनिक्स की दुकान (electronics). Mobile, accessories, repairs.
Key fields: brand, model, imei (optional), warranty date, repair status, customer phone.
Font: Hindi labels, tech specs in English.
User type: electronics shop owner.`,

  restaurant: `रेस्तरां / dhaba. Menu items, orders, table management, billing.
Key fields: menu item, price, category (veg/non-veg), table number, order status, staff name.
Font: Hindi labels, English for dish names.
User type: restaurant owner.`,

  other: `General small shop. Daily sales, stock, customers.
Key fields: item name, price, stock, customer name, date.
Font: Hindi labels, numbers in Arabic.
User type: shop owner.`,
}

// ─── Builder Context (injected into builderAgent system prompt) ─────────────

const BUILDER_CONTEXTS: Record<BusinessCategory, string> = {
  kirana: `Business: Kirana (small grocery shop)
- Menu items: Stock list, Add item, Quick sell, Today's sales
- Pages: Dashboard, Stock, Add Sale, Suppliers, Low Stock Alerts
- Key components: product card with quantity badge + unit, search bar, barcode placeholder
- Empty state: "No items added. Click + to add your first product."
- Hindi terms: सामान (items), स्टॉक (stock), मूल्य (price), बिक्री (sales)`,

  tailor: `Business: Tailoring / Darzi
- Menu items: Active orders, New order, Measurements, Calendar
- Pages: Dashboard, New Order, Measurements, Orders list, Due date reminder
- Key components: measurement form (dropdowns for neck/chest/waist/length), order status card, calendar view
- Empty state: "No orders yet. Tap New Order to add your first."
- Hindi terms: ग्राहक (customer), सिलाई (sewing), माप (measurement), स्टाइल (style)`,

  dairy: `Business: Dairy/मilk vendor
- Menu items: Daily orders, Customer list, Morning/Evening schedule, Payments
- Pages: Dashboard, New Order, Customers, Schedule, Dues
- Key components: order card with qty (litre), delivery shift badge (am/pm), customer phone link
- Empty state: "No orders yet. Tap New Order to add your first."
- Hindi terms: ग्राहक (customer), दूध (milk), लीटर (litre), देय (dues)`,

  pharmacy: `Business: Pharmacy/Chemist shop
- Menu items: Stock, Expiry check, Quick sell, Add medicine
- Pages: Dashboard, Medicines, Sales, Expiry alerts, Prescriptions
- Key components: medicine card with expiry date badge (red if <3 months), search by name, batch
- Empty state: "No medicines added. Tap + to add your first."
- Hindi terms: दवाई (medicine), बैच (batch), कमी (shortage), नुस्खा (prescription)`,

  electronics: `Business: Electronics/Mobile shop
- Menu items: Stock, New repair, Sales, Warranty
- Pages: Dashboard, Inventory, Repair, Sales, Warranty tracker
- Key components: product card with IMEI, warranty badge, repair status card (with parts used), price in ₹
- Empty state: "No products added. Tap + to add your first."
- Hindi terms: मोबाइल (mobile), रिपेयर (repair), वारंटी (warranty), नई बिक्री (new sale)`,

  restaurant: `Business: Restaurant / Dhaba
- Menu items: New order, Menu, Table view, Billing, Kitchen display
- Pages: Dashboard, Orders, Menu, Tables, Billing, Staff
- Key components: table card with order status (pending/served), menu item card (veg/non-veg badge in green/red), bill total card
- Empty state: "No orders yet. Tap New Order to add your first."
- Hindi terms: आडर (order), मेनू (menu), टेबल (table), बिल (bill)`,

  other: `Business: General small business
- Menu items: Add item, Sales, Stock, Customers
- Pages: Dashboard, Inventory, Sales, Customer list, Reports
- Key components: generic item card, price + stock badge, customer contact form
- Empty state: "No items yet. Tap + to add your first."
- Hindi terms: सामान (items), बिक्री (sales), ग्राहक (customer), ₹ मूल्य (price)`,
}

// ─── Observer Context ───────────────────────────────────────────────────────

const OBSERVER_HINTS: Record<BusinessCategory, string> = {
  kirana: 'Watch for: stock=0 not alerted, barcode not working, MRP missing, expiry check missing',
  tailor: 'Watch for: measurement unit mismatch (cm vs inch), due date not shown, fabric not asked',
  dairy: 'Watch for: litre/kg unit mismatch, morning/evening shift not toggleable, payment not tracked',
  pharmacy: 'Watch for: expiry date not checked, batch not stored, GST not calculated, prescription not linked',
  electronics: 'Watch for: IMEI not stored, warranty not calculated, repair status not updated',
  restaurant: 'Watch for: veg/non-veg badge missing, table number not linked, bill total not calculated',
  other: 'Watch for: price not stored, customer contact missing, date not auto-set',
}

// ─── Proposer Examples ──────────────────────────────────────────────────────

const PROPOSER_HINTS: Record<BusinessCategory, string> = {
  kirana: `Example improvements: Add low stock banner, Add supplier phone quick-dial, Add per-item profit view, Add WhatsApp order link`,
  tailor: `Example improvements: Add measurement reminder to customer, Add style photo upload placeholder, Add due date calendar view`,
  dairy: `Example improvements: Add monthly summary, Add delivery route grouping, Add payment reminder SMS, Add shift toggle for each customer`,
  pharmacy: `Example improvements: Add auto-reorder below threshold, Add GST-inclusive pricing, Add doctor-specific prescription view`,
  electronics: `Example improvements: Add IMEI scan camera placeholder, Add warranty expiry banner, Add repair status tracker`,
  restaurant: `Example improvements: Add table QR menu, Add bill split feature, Add kitchen order queue, Add daily sales summary`,
  other: `Example improvements: Add sales graph, Add customer loyalty card, Add expense tracking, Add profit per item view`,
}

// ─── Default / Fallback Templated Strings ─────────────────────────────────────

const SUGGESTED_PAGES: Record<BusinessCategory, string[]> = {
  kirana: ['Dashboard', 'Stock', 'Add Sale', 'Suppliers', 'Reports'],
  tailor: ['Dashboard', 'New Order', 'Measurements', 'Orders', 'Calendar'],
  dairy: ['Dashboard', 'Orders', 'Customers', 'Schedule', 'Dues'],
  pharmacy: ['Dashboard', 'Medicines', 'Sales', 'Expiry', 'Prescriptions'],
  electronics: ['Dashboard', 'Stock', 'Repair', 'Sales', 'Warranty'],
  restaurant: ['Dashboard', 'Orders', 'Menu', 'Tables', 'Billing'],
  other: ['Dashboard', 'Inventory', 'Sales', 'Customers', 'Reports'],
}

const DATA_FIELD_HINTS: Record<BusinessCategory, { name: string; type: string }[]> = {
  kirana: [
    { name: 'itemName', type: 'string' },
    { name: 'stockQty', type: 'number' },
    { name: 'unit', type: 'string' },
    { name: 'pricePerUnit', type: 'number' },
    { name: 'supplierName', type: 'string' },
  ],
  tailor: [
    { name: 'customerName', type: 'string' },
    { name: 'neck', type: 'number' },
    { name: 'chest', type: 'number' },
    { name: 'waist', type: 'number' },
    { name: 'length', type: 'number' },
    { name: 'fabric', type: 'string' },
    { name: 'dueDate', type: 'date' },
  ],
  dairy: [
    { name: 'customerName', type: 'string' },
    { name: 'qty', type: 'number' },
    { name: 'shift', type: 'string' },
    { name: 'deliveryDate', type: 'date' },
    { name: 'paid', type: 'boolean' },
  ],
  pharmacy: [
    { name: 'medicineName', type: 'string' },
    { name: 'batchNo', type: 'string' },
    { name: 'expiryDate', type: 'date' },
    { name: 'mrp', type: 'number' },
    { name: 'stockQty', type: 'number' },
    { name: 'doctorName', type: 'string' },
  ],
  electronics: [
    { name: 'brand', type: 'string' },
    { name: 'model', type: 'string' },
    { name: 'imei', type: 'string' },
    { name: 'warrantyDate', type: 'date' },
    { name: 'repairStatus', type: 'string' },
    { name: 'customerPhone', type: 'string' },
  ],
  restaurant: [
    { name: 'menuItem', type: 'string' },
    { name: 'price', type: 'number' },
    { name: 'category', type: 'string' },
    { name: 'tableNo', type: 'number' },
    { name: 'orderStatus', type: 'string' },
  ],
  other: [
    { name: 'itemName', type: 'string' },
    { name: 'price', type: 'number' },
    { name: 'stock', type: 'number' },
    { name: 'customerName', type: 'string' },
    { name: 'date', type: 'date' },
  ],
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function getPromptTemplate(category: string): PromptTemplate {
  const cat = (category?.toLowerCase() as BusinessCategory) || 'other'
  // Normalize common misspellings / aliases
  const c: BusinessCategory = NORMALIZE[cat] || (Object.keys(INTENT_HINTS).includes(cat) ? cat : 'other')

  return {
    category: c,
    intentHint: INTENT_HINTS[c],
    builderContext: BUILDER_CONTEXTS[c],
    observerContext: OBSERVER_HINTS[c],
    proposerExamples: PROPOSER_HINTS[c],
    suggestedPages: SUGGESTED_PAGES[c],
    dataFieldHints: DATA_FIELD_HINTS[c],
  }
}

const NORMALIZE: Partial<Record<string, BusinessCategory>> = {
  grocer: 'kirana',
  general: 'kirana',
  'kirana shop': 'kirana',
  sewing: 'tailor',
  darzi: 'tailor',
  milk: 'dairy',
  medi: 'pharmacy',
  medical: 'pharmacy',
  chemist: 'pharmacy',
  mobile: 'electronics',
  mobileshop: 'electronics',
  mobilerepair: 'electronics',
  dhaba: 'restaurant',
  hotel: 'restaurant',
  food: 'restaurant',
  cafe: 'restaurant',
}

// ─── Convenience: Get builder system prompt for a spec ───────────────────────
export function getBuilderContext(category: string): string {
  return getPromptTemplate(category).builderContext
}

// ─── Convenience: Get intent extraction hint ─────────────────────────────────
export function getIntentHint(category: string): string {
  return getPromptTemplate(category).intentHint
}
