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
COMPONENT GUIDE (shadcn/ui pre-installed):
You have shadcn/ui components at @/components/ui/*. IMPORT AND USE THEM. You also have cn() from @/lib/utils.

AVAILABLE COMPONENTS:
- import { Button } from "@/components/ui/button"  // variants: default, destructive, outline, secondary, ghost, link. sizes: default, sm, lg, icon
- import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
- import { Input } from "@/components/ui/input"
- import { Label } from "@/components/ui/label"
- import { Badge } from "@/components/ui/badge"  // variants: default, secondary, destructive, outline
- import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
- import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
- import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
- import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
- import { Separator } from "@/components/ui/separator"
- import { cn } from "@/lib/utils"

LAYOUT SHELL (use in app/layout.tsx):
\`\`\`tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Home, Package, Plus, Users, BarChart3, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/add", label: "Add New", icon: Plus },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
          <span className="font-bold text-lg tracking-tight">AppName</span>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors", path === n.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/10")}>
                <n.icon className="w-4 h-4" />{n.label}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button>
        </div>
        {open && (
          <div className="md:hidden border-t p-2">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-sm", path === n.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground")}>
                <n.icon className="w-4 h-4" />{n.label}
              </Link>
            ))}
          </div>
        )}
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
\`\`\`

DASHBOARD PAGE PATTERN (use Card + Badge):
\`\`\`tsx
import { Card, CardContent } from "@/components/ui/card";
// Stats: grid grid-cols-1 sm:grid-cols-3 gap-4
// Each stat: <Card><CardContent className="p-5 flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div><Icon className="w-5 h-5 text-primary" /></CardContent></Card>
\`\`\`

DATA TABLE PATTERN (use Table component):
\`\`\`tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
<Card>
  <CardHeader className="flex-row items-center justify-between">
    <CardTitle>Items</CardTitle>
    <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{items.map(item => (
        <TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell>{item.price}</TableCell><TableCell><Badge variant="secondary">Active</Badge></TableCell></TableRow>
      ))}</TableBody>
    </Table>
  </CardContent>
</Card>
\`\`\`

FORM PATTERN (use Input + Label + Button):
\`\`\`tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
<form onSubmit={handleSubmit} className="space-y-4">
  <div className="grid gap-2"><Label htmlFor="name">Name</Label><Input id="name" value={v} onChange={e => setV(e.target.value)} /></div>
  <Button type="submit" className="w-full">Save</Button>
</form>
\`\`\`

DIALOG PATTERN (use Dialog component):
\`\`\`tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
<Dialog><DialogTrigger asChild><Button>Open</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Confirm</DialogTitle></DialogHeader>{/* content */}<div className="flex gap-3 mt-4"><Button variant="outline" className="flex-1">Cancel</Button><Button className="flex-1">Confirm</Button></div></DialogContent></Dialog>
\`\`\`

EMPTY STATE PATTERN:
\`\`\`tsx
<div className="flex flex-col items-center justify-center py-20 text-center">
  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
    <Package className="w-8 h-8 text-primary" />
  </div>
  <h3 className="text-lg font-bold mb-1">No items yet</h3>
  <p className="text-sm text-muted-foreground mb-4">Add your first item to get started.</p>
  <Button><Plus className="w-4 h-4 mr-1" />Add Item</Button>
</div>
\`\`\`

ZUSTAND STORE PATTERN:
\`\`\`tsx
import { create } from "zustand";
interface Item { id: string; name: string; price: number; }
interface Store { items: Item[]; addItem: (item: Omit<Item, "id">) => void; removeItem: (id: string) => void; }
const useStore = create<Store>((set) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, { ...item, id: crypto.randomUUID() }] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));
\`\`\`
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
