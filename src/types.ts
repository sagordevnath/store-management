export type ID = string;

/* ---------------- Categories (unlimited nesting) ---------------- */

export interface Category {
  id: ID;
  name: string;
  parentId: ID | null;
  icon: string; // emoji
  createdAt: string;
}

export interface Product {
  id: ID;
  name: string;
  sku: string;
  categoryId: ID | null;
  price: number; // retail price
  cost: number; // purchase cost
  stock: number;
  lowStockAt: number;
  unit: string;
  createdAt: string;
  /* --- rich product form (Phase 3) --- */
  image?: string | null; // dataURL for upload / drag & drop preview
  description?: string;
  barcode?: string;
  warrantyMonths?: number; // 0 = no warranty
  forRetailSale?: boolean; // shown in POS grid when true
  lowStockAlert?: boolean; // master switch for low-stock alerts
  vatIncluded?: boolean; // price already includes VAT — don't tax again
  discountable?: boolean; // eligible for discounts
  /* --- Phase 4 --- */
  priceTier?: Partial<Record<PriceTier, number>>; // wholesale/distributor price overrides
  trackExpiry?: boolean; // capture batch + expiry on purchases
  expiryDate?: string | null; // latest known expiry (manual or from last batch)
  shelfLifeDays?: number; // used to prefill expiry = today + shelfLife
}

export type PaymentMethod = "Cash" | "Card" | "Mobile Money" | "Due";

/* ---------------- Phase 4: price tiers (retail → wholesale → distribution) ---------------- */

export type PriceTier = "retail" | "wholesale" | "distributor";

export interface SaleReturnItem {
  productId: ID;
  name: string;
  qty: number;
  unitPrice: number;
  reason: string;
}

/** A customer return against a sales invoice. */
export interface SaleReturn {
  id: ID;
  no: string; // RET-1001
  saleId: ID;
  invoiceNo: string;
  at: string;
  items: SaleReturnItem[];
  amount: number; // refund value (item prices × qty)
  refundMethod: "Cash refund" | "Store credit" | "Adjust due";
  restock: boolean;
  note: string;
}

/** A return to a supplier against a purchase order. */
export interface PurchaseReturn {
  id: ID;
  no: string; // PRET-1001
  purchaseId: ID;
  refNo: string;
  at: string;
  items: SaleReturnItem[]; // unitPrice holds the unit cost
  amount: number;
  creditNote: boolean; // supplier credit / payable reduction vs cash refund
  note: string;
}

/** Branch / outlet for multi-location businesses. */
export interface Branch {
  id: ID;
  name: string;
  address: string;
  createdAt: string;
}

export interface SaleItem {
  productId: ID;
  name: string;
  unitPrice: number;
  unitCost: number;
  qty: number;
  discount: number; // line discount amount (not percent)
}

export interface DeliveryTrack {
  enabled: boolean;
  driver: string;
  status: "Preparing" | "On the way" | "Delivered";
  lat: number;
  lng: number;
  updatedAt: string;
  history: { at: string; status: DeliveryTrack["status"]; lat: number; lng: number }[];
}

export interface Sale {
  id: ID;
  invoiceNo: string;
  at: string; // ISO
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  costTotal: number;
  profit: number;
  payment: PaymentMethod;
  customerId: ID | null;
  note: string;
  cashier: string;
  status: "Paid" | "Partially Paid" | "Unpaid";
  paidAmount: number;
  signature?: string | null; // dataURL of drawn e-signature
  delivery?: DeliveryTrack | null;
  /* --- Phase 4 --- */
  branchId?: ID | null;
  priceTier?: PriceTier; // tier applied at sale time
  pointsEarned?: number; // loyalty points granted by this sale
  pointsRedeemed?: number; // loyalty points spent on this sale
}

export interface Purchase {
  id: ID;
  refNo: string;
  at: string;
  supplierId: ID | null;
  items: { productId: ID; name: string; unitCost: number; qty: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  payment: "Paid" | "Due";
  paidAmount: number;
  note: string;
  branchId?: ID | null;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  address: string;
  openingDue: number;
  createdAt: string;
  /* --- Phase 4 --- */
  tier: PriceTier; // drives POS pricing
  creditLimit: number; // 0 = no credit sales allowed
  points: number; // loyalty balance
}

export interface Supplier {
  id: ID;
  name: string;
  company: string;
  phone: string;
  openingDue: number;
  createdAt: string;
}

export type ExpenseCategory =
  | "Rent"
  | "Utilities"
  | "Salaries"
  | "Transport"
  | "Marketing"
  | "Supplies"
  | "Maintenance"
  | "Other";

export interface Expense {
  id: ID;
  at: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  branchId?: ID | null;
}

export interface StaffMember {
  id: ID;
  name: string;
  role: string;
  phone: string;
  joinedAt: string;
  active: boolean;
  image?: string | null; // staff photo (dataURL)
}

/* ---------------- Subscription / billing ---------------- */

export type PlanTier = "trial" | "basic" | "pro" | "enterprise";
export type BillingCycle = "monthly" | "yearly";
export type PayMethod = "bKash" | "Nagad" | "Card";
export type SubStatus =
  | "trialing"
  | "active"
  | "past_due" // in grace period after a lapsed period
  | "expired"
  | "canceled";

export interface Subscription {
  tier: PlanTier;
  status: SubStatus;
  billingCycle: BillingCycle | null;
  startedAt: string; // subscription (or trial) start
  currentPeriodEnd: string; // when the current period / trial ends
  autoRenew: boolean;
  paymentMethod: PayMethod | null;
  couponCode: string | null;
  couponRedeemsLeft: number; // discounted cycles remaining
  canceledAt: string | null;
}

export interface SubInvoice {
  id: ID;
  no: string;
  at: string;
  tier: PlanTier;
  cycle: BillingCycle;
  amount: number; // after discount
  discountLabel?: string;
  method: PayMethod;
  status: "Paid" | "Due";
}

/* ---------------- Settings ---------------- */

export interface Settings {
  shopName: string;
  tagline: string;
  currency: string;
  taxRate: number; // percent
  lowStockDefault: number;
  ownerName: string;
  monthlyTarget: number; // sales target for dashboard
  branches: number;
  /* --- Phase 4 --- */
  loyaltyEnabled: boolean;
  loyaltyRate: number; // points earned per 100 spent
  pointValue: number; // currency value of one point when redeeming
  /* --- Branding & invoices (Phase 5) --- */
  logo?: string | null; // company logo (dataURL) — sidebar, invoices
  ownerImage?: string | null; // owner photo — settings profile + invoice signatory
  address?: string; // shop address printed on invoices
  phone?: string;
  email?: string;
  website?: string;
  regNo?: string; // business / VAT registration number
  invoiceNote?: string; // footer note (terms, thank-you, return policy)
}

/* ---------------- Phase 6: roles & permissions ---------------- */

export type ModuleKey =
  | "dashboard" | "pos" | "sales" | "purchases" | "returns" | "products"
  | "categories" | "customers" | "suppliers" | "staff" | "expenses"
  | "reports" | "tools" | "storefront" | "wallet" | "messages" | "recycle"
  | "audit" | "access" | "billing" | "settings";

/** Per-module capability. "none" hides the module entirely. */
export type Perm = "none" | "view" | "edit" | "all";

export type PresetRole = "owner" | "manager" | "cashier" | "accountant" | "custom";

export interface StaffAccount {
  staffId: ID;               // links to StaffMember
  username: string;
  pin: string;               // demo-grade PIN auth
  role: PresetRole;
  perms: Partial<Record<ModuleKey, Perm>>; // only meaningful when role === "custom"
  active: boolean;
  isOwner?: boolean;         // the protected primary account — cannot be edited/removed
  createdAt: string;
}

export interface AuditEntry {
  id: ID;
  at: string;
  actor: string;             // display name ("Owner" default)
  action: "create" | "update" | "delete" | "restore" | "login" | "sale" | "payment" | "purge";
  entity: string;            // "Sale", "Product", "Customer"…
  ref: string;               // invoice no / sku / name
  detail: string;            // human-readable one-liner
  branchId?: ID | null;
}

/* ---------------- Phase 6: recycle bin ---------------- */

export interface TrashItem {
  id: ID;
  deletedAt: string;
  deletedBy: string;
  kind: "product" | "customer" | "supplier" | "expense" | "sale";
  label: string;             // name / invoice no for display
  sub: string;               // sku / phone / category for display
  payload: Product | Customer | Supplier | Expense | Sale; // original record
}

/* ---------------- Phase 6: wallet (mobile-banking style) ---------------- */

export type WalletChannel = "bKash" | "Nagad" | "Rocket" | "Bank";

export interface WalletTx {
  id: ID;
  at: string;
  channel: WalletChannel;
  kind: "in" | "out";        // money in / money out of the wallet
  amount: number;
  fee: number;               // cash-out / send-money fee
  ref: string;               // TrxID
  note: string;
  linkedSaleId?: ID | null;  // when a sale was settled through the wallet
}

export interface WalletAccount {
  channel: WalletChannel;
  number: string;
}

/* ---------------- Phase 6: communication ---------------- */

export interface ChatMsg {
  id: ID;
  at: string;
  from: "me" | "them";
  text: string;
  kind: "chat" | "sms" | "system";
}

export interface Thread {
  id: ID;
  party: "customer" | "supplier";
  partyId: ID;
  messages: ChatMsg[];
  unread: number;
  updatedAt: string;
}

export interface ReminderLog {
  id: ID;
  at: string;
  customerId: ID;
  customerName: string;
  amount: number;
  method: "sms" | "call" | "whatsapp";
  note: string;
}

/* ---------------- Phase 6: marketing ---------------- */

export interface Campaign {
  id: ID;
  at: string;
  title: string;
  body: string;
  audience: "all" | "due" | "loyal" | "inactive";
  count: number;
  channel: "sms" | "announcement";
}

/* ---------------- Phase 6: online storefront ---------------- */

export interface StorefrontTheme {
  accent: string;            // hex
  hero: string;              // tagline line
  banner?: string | null;    // dataURL
  font: "modern" | "friendly" | "classic";
}

export interface StorefrontOrder {
  id: ID;
  at: string;
  customerName: string;
  phone: string;
  address: string;
  items: { productId: ID; name: string; price: number; qty: number }[];
  total: number;
  status: "New" | "Accepted" | "Delivered" | "Rejected";
  note: string;
}

export interface StorefrontSettings {
  enabled: boolean;
  slug: string;              // public link: #shop/<slug>
  customDomain: string;
  theme: StorefrontTheme;
  visibleCategoryIds: ID[] | null; // null = all
  minOrder: number;
  deliveryFee: number;
}

/* ---------------- Phase 8: onboarding ---------------- */

export type BusinessPreset = "grocery" | "pharmacy" | "electronics" | "fashion" | "wholesale" | null;

export interface DB {
  products: Product[];
  categories: Category[];
  sales: Sale[];
  purchases: Purchase[];
  customers: Customer[];
  suppliers: Supplier[];
  expenses: Expense[];
  staff: StaffMember[];
  subscription: Subscription;
  subInvoices: SubInvoice[];
  settings: Settings;
  /* --- Phase 4 --- */
  saleReturns: SaleReturn[];
  purchaseReturns: PurchaseReturn[];
  branches: Branch[];
  /* --- Phase 6 --- */
  accounts: StaffAccount[];
  audit: AuditEntry[];
  trash: TrashItem[];
  wallet: WalletTx[];
  walletAccounts: WalletAccount[];
  threads: Thread[];
  reminders: ReminderLog[];
  campaigns: Campaign[];
  storefront: StorefrontSettings;
  storefrontOrders: StorefrontOrder[];
  onboarding: BusinessPreset;
}
