import type { DB, WalletChannel, WalletTx } from "../types";
import { round2, uid } from "./helpers";

export const WALLET_CHANNELS: WalletChannel[] = ["bKash", "Nagad", "Rocket", "Bank"];

/** Suggested send-money / cash-out fee rates (demo rates for Bangladesh MFS). */
export const CHANNEL_FEE_RATE: Record<WalletChannel, number> = {
  bKash: 0.0185,
  Nagad: 0.0125,
  Rocket: 0.018,
  Bank: 0,
};

export function walletBalance(db: DB, channel?: WalletChannel): number {
  let bal = 0;
  for (const tx of db.wallet) {
    if (channel && tx.channel !== channel) continue;
    bal += tx.kind === "in" ? tx.amount : -(tx.amount + tx.fee);
  }
  return round2(bal);
}

export function allWalletBalance(db: DB): number {
  return round2(WALLET_CHANNELS.reduce((s, ch) => s + walletBalance(db, ch), 0));
}

export function channelNumber(db: DB, channel: WalletChannel): string {
  return db.walletAccounts.find((a) => a.channel === channel)?.number ?? "";
}

export function setChannelNumber(db: DB, channel: WalletChannel, number: string): DB {
  const exists = db.walletAccounts.some((a) => a.channel === channel);
  const walletAccounts = exists
    ? db.walletAccounts.map((a) => (a.channel === channel ? { ...a, number } : a))
    : [...db.walletAccounts, { channel, number }];
  return { ...db, walletAccounts };
}

export interface WalletEntryArgs {
  channel: WalletChannel;
  kind: WalletTx["kind"];
  amount: number;
  ref: string;
  note: string;
  linkedSaleId?: string | null;
  autoFee?: boolean;
}

export function addWalletTx(db: DB, args: WalletEntryArgs): { db: DB; tx: WalletTx } {
  const fee = args.autoFee && args.kind === "out" ? round2(args.amount * CHANNEL_FEE_RATE[args.channel]) : 0;
  const tx: WalletTx = {
    id: uid("wtx"),
    at: new Date().toISOString(),
    channel: args.channel,
    kind: args.kind,
    amount: round2(args.amount),
    fee,
    ref: args.ref.trim() || uidRef(args.channel),
    note: args.note,
    linkedSaleId: args.linkedSaleId ?? null,
  };
  return { db: { ...db, wallet: [tx, ...db.wallet] }, tx };
}

function uidRef(channel: WalletChannel): string {
  const p = channel === "Bank" ? "BNK" : channel.slice(0, 3).toUpperCase();
  return `${p}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export function todayWalletIn(db: DB): number {
  const today = new Date().toDateString();
  return round2(
    db.wallet.filter((t) => new Date(t.at).toDateString() === today && t.kind === "in").reduce((s, t) => s + t.amount, 0),
  );
}
