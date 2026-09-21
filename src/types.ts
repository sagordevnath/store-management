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
}
