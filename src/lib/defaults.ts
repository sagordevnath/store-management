import type { StaffAccount, StorefrontSettings, WalletTx, WalletAccount } from "../types";
import { uid, daysAgoISO } from "./helpers";

/**
 * Built-in owner account — full access by role, cannot be edited or removed
 * (the isOwner flag marks it as the protected primary account).
 */
export function defaultAccounts(db: { staff: { id: string; name: string }[] }): StaffAccount[] {
  const ownerStaff = db.staff[0];
  const now = new Date().toISOString();
  const acct: StaffAccount = {
    staffId: ownerStaff?.id ?? "owner",
    username: "owner",
    pin: "1234",
    role: "owner",
    perms: {},
    active: true,
    createdAt: now,
  };
  return [Object.assign(acct, { isOwner: true }) as StaffAccount & { isOwner: boolean }];
}

export function defaultStorefront(): StorefrontSettings {
  return {
    enabled: false,
    slug: "my-shop",
    customDomain: "",
    theme: {
      accent: "#16a34a",
      hero: "Fresh picks, fair prices, delivered fast.",
      banner: null,
      font: "modern",
    },
    visibleCategoryIds: null,
    minOrder: 0,
    deliveryFee: 0,
  };
}

/** Demo wallet history for fresh seeds and migrated (pre-Phase-6) documents. */
export function demoWallet(): { wallet: WalletTx[]; walletAccounts: WalletAccount[] } {
  return {
    wallet: [
      { id: uid("wtx"), at: daysAgoISO(0, 10), channel: "bKash", kind: "in", amount: 12500, fee: 0, ref: "BKX8QW2M", note: "Customer payments — INV-1041..1042", linkedSaleId: null },
      { id: uid("wtx"), at: daysAgoISO(1, 15), channel: "Nagad", kind: "in", amount: 21000, fee: 0, ref: "NGP41KKL", note: "Wholesale customer payment — INV-1039", linkedSaleId: null },
      { id: uid("wtx"), at: daysAgoISO(2, 12), channel: "bKash", kind: "out", amount: 6000, fee: 111, ref: "BKZ77HAD", note: "Supplier payment — Fresh Distributors", linkedSaleId: null },
      { id: uid("wtx"), at: daysAgoISO(4, 9), channel: "Bank", kind: "out", amount: 18000, fee: 0, ref: "BNK-TR-88410", note: "Shop rent transfer", linkedSaleId: null },
    ],
    walletAccounts: [
      { channel: "bKash", number: "01712-345678" },
      { channel: "Nagad", number: "01812-345678" },
      { channel: "Bank", number: "BRAC 1501-2030-4567" },
    ],
  };
}
