import React from "react";

type P = { size?: number; className?: string };

function base(size: number | undefined, className: string | undefined, children: React.ReactNode, fill = false) {
  return fill ? (
    <svg width={size ?? 18} height={size ?? 18} viewBox="0 0 24 24" fill="currentColor" className={className}>
      {children}
    </svg>
  ) : (
    <svg
      width={size ?? 18}
      height={size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IcDashboard = (p: P) =>
  base(p.size, p.className, <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>);

export const IcCart = (p: P) =>
  base(p.size, p.className, <>
    <circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" />
    <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.3h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
  </>);

export const IcBox = (p: P) =>
  base(p.size, p.className, <>
    <path d="M21 8.5v7L12 21l-9-5.5v-7L12 3l9 5.5z" /><path d="M3.3 8.6 12 13l8.7-4.4" /><path d="M12 13v8" />
  </>);

export const IcSale = (p: P) =>
  base(p.size, p.className, <>
    <path d="M6 3h12a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h4" />
  </>);

export const IcTruck = (p: P) =>
  base(p.size, p.className, <>
    <path d="M1 5h13v11H1z" /><path d="M14 9h4l4 4v3h-8" /><circle cx="6" cy="18.5" r="1.6" /><circle cx="17.5" cy="18.5" r="1.6" />
  </>);

export const IcUsers = (p: P) =>
  base(p.size, p.className, <>
    <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
    <circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.2.2 3.9 1.7 4.4 4.3" />
  </>);

export const IcBuilding = (p: P) =>
  base(p.size, p.className, <>
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h3a1 1 0 0 1 1 1v11" />
    <path d="M8 7h4M8 11h4M8 15h4" /><path d="M3 21h18" />
  </>);

export const IcWallet = (p: P) =>
  base(p.size, p.className, <>
    <rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
  </>);

export const IcChart = (p: P) =>
  base(p.size, p.className, <>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </>);

export const IcStaff = (p: P) =>
  base(p.size, p.className, <>
    <circle cx="12" cy="7.5" r="3.5" /><path d="M5 20c.8-3.8 3.5-6 7-6s6.2 2.2 7 6" />
  </>);

export const IcSettings = (p: P) =>
  base(p.size, p.className, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H2a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H8a1.7 1.7 0 0 0 1-1.56V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </>);

export const IcPlus = (p: P) => base(p.size, p.className, <><path d="M12 5v14M5 12h14" /></>);

export const IcSearch = (p: P) =>
  base(p.size, p.className, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>);

export const IcTrash = (p: P) =>
  base(p.size, p.className, <>
    <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><path d="M10 11v6M14 11v6" />
  </>);

export const IcEdit = (p: P) =>
  base(p.size, p.className, <><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5 17.5 10.5" /></>);

export const IcDownload = (p: P) =>
  base(p.size, p.className, <><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></>);

export const IcDoc = (p: P) =>
  base(p.size, p.className, <>
    <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </>);

export const IcPrint = (p: P) =>
  base(p.size, p.className, <>
    <path d="M7 8V4h10v4" /><rect x="4" y="8" width="16" height="8" rx="1.5" /><path d="M7 14h10v6H7z" />
  </>);

export const IcAlert = (p: P) =>
  base(p.size, p.className, <>
    <path d="M12 3 2.5 20h19L12 3z" /><path d="M12 9.5v4.5" /><circle cx="12" cy="16.8" r="0.4" fill="currentColor" />
  </>);

export const IcCash = (p: P) =>
  base(p.size, p.className, <>
    <rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9.5h.01M18.5 14.5h.01" />
  </>);

export const IcLogout = (p: P) =>
  base(p.size, p.className, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>);

export const IcStore = (p: P) =>
  base(p.size, p.className, <>
    <path d="M3 9.5 5 4h14l2 5.5" /><path d="M3 9.5h18" /><path d="M4.5 9.5V20h15V9.5" />
    <path d="M9 20v-6h6v6" />
  </>);

export const IcCheck = (p: P) => base(p.size, p.className, <><path d="m4.5 12.5 5 5 10-11" /></>);

export const IcCategories = (p: P) =>
  base(p.size, p.className, <>
    <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" />
  </>);

export const IcCrown = (p: P) =>
  base(p.size, p.className, <><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.6 11H4.6L3 8Z" /></>);

export const IcTools = (p: P) =>
  base(p.size, p.className, <><path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 0 0 5.6-6l-3 3-2.8-.7-.7-2.8 3.5-2.5Z" /></>);

export const IcTrend = (p: P) =>
  base(p.size, p.className, <><path d="M3 17l6-6 4 4 8-8" /><path d="M14.5 7H21v6.5" /></>);

export const IcReceipt = (p: P) =>
  base(p.size, p.className, <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7.5h6M9 11.5h6M9 15.5h3.5" /></>);

export const IcRefresh = (p: P) =>
  base(p.size, p.className, <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>);

export const IcEye = (p: P) =>
  base(p.size, p.className, <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>);

export const IcEyeOff = (p: P) =>
  base(p.size, p.className, <>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.5 17.5 0 0 1-2.4 3.2" />
    <path d="M6.1 6.7A16.9 16.9 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4-.9" />
    <path d="M9.9 10.2a3 3 0 0 0 4.2 4.2" />
  </>);

export const IcQr = (p: P) =>
  base(p.size, p.className, <>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z" />
  </>);

export const IcShield = (p: P) =>
  base(p.size, p.className, <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4.5" /></>);

export const IcMegaphone = (p: P) =>
  base(p.size, p.className, <>
    <path d="M3 10v4a1 1 0 0 0 1 1h2l4 4V5L6 9H4a1 1 0 0 0-1 1Z" />
    <path d="M13 8.5a4 4 0 0 1 0 7M15.5 6a7.5 7.5 0 0 1 0 12" />
  </>);

export const IcChat = (p: P) =>
  base(p.size, p.className, <><path d="M21 12a8 8 0 0 1-8 8H4l1.5-3.2A8 8 0 1 1 21 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></>);

export const IcTrashRestore = (p: P) =>
  base(p.size, p.className, <>
    <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M12 11v4M10 13l2-2 2 2" />
  </>);

export const IcScan = (p: P) =>
  base(p.size, p.className, <>
    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M3 12h18" />
  </>);

export const IcBranch = (p: P) =>
  base(p.size, p.className, <>
    <circle cx="6" cy="5" r="2.2" /><circle cx="18" cy="5" r="2.2" /><circle cx="12" cy="19" r="2.2" />
    <path d="M6 7.5v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2M12 12.5v4" />
  </>);

export const IcGlobe = (p: P) =>
  base(p.size, p.className, <>
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
  </>);
