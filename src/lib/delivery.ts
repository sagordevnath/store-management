/** Simulated GPS delivery tracking (no external map dependency). */

import type { DeliveryTrack } from "../types";

/** Shop location (Dhaka) — the delivery van starts here. */
export const SHOP_LOCATION = { lat: 23.7806, lng: 90.4074 };

/** Deterministic jitter so a sale always maps to the same customer area. */
function hashOffset(seed: string): { lat: number; lng: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = ((h & 0xff) / 255 - 0.5) * 0.024; // ≈ ±1.3 km
  const b = (((h >> 8) & 0xff) / 255 - 0.5) * 0.024;
  return { lat: a, lng: b };
}

export function customerLocation(seed: string): { lat: number; lng: number } {
  const o = hashOffset(seed);
  return { lat: SHOP_LOCATION.lat + o.lat, lng: SHOP_LOCATION.lng + o.lng };
}

export function initDelivery(saleId: string): DeliveryTrack {
  const now = new Date().toISOString();
  return {
    enabled: true,
    driver: "Karim",
    status: "Preparing",
    lat: SHOP_LOCATION.lat,
    lng: SHOP_LOCATION.lng,
    updatedAt: now,
    history: [{ at: now, status: "Preparing", lat: SHOP_LOCATION.lat, lng: SHOP_LOCATION.lng }],
  };
}

/** One tap = one leg: Preparing → On the way (moves 45% closer per tap) → Delivered. */
export function stepDelivery(track: DeliveryTrack, target: { lat: number; lng: number }): DeliveryTrack {
  const now = new Date().toISOString();
  if (track.status === "Preparing") {
    return {
      ...track,
      status: "On the way",
      updatedAt: now,
      history: [...track.history, { at: now, status: "On the way", lat: track.lat, lng: track.lng }],
    };
  }
  if (track.status === "On the way") {
    const lat = track.lat + (target.lat - track.lat) * 0.45;
    const lng = track.lng + (target.lng - track.lng) * 0.45;
    const dist = Math.hypot(target.lat - lat, target.lng - lng);
    const done = dist < 0.004;
    return {
      ...track,
      lat,
      lng,
      status: done ? "Delivered" : "On the way",
      updatedAt: now,
      history: [...track.history, { at: now, status: done ? "Delivered" : "On the way", lat, lng }],
    };
  }
  return track;
}
