import type {
  DB,
  Product,
  Customer,
  Supplier,
  Expense,
  StaffMember,
  Sale,
  SaleItem,
  Purchase,
  Category,
  Branch,
} from "../types";
import { uid, daysAgoISO, round2 } from "./helpers";
import { TRIAL_DAYS } from "./plans";
import { defaultAccounts, defaultStorefront } from "./defaults";

/** [name, leaf category id (null = intentionally uncategorized demo), price, cost, unit, lowStockAt] */
const PRODUCTS_RAW: [string, string | null, number, number, string, number][] = [
  ["Basmati Rice 5kg", "gro-rice", 18.5, 13.2, "bag", 8],
  ["Sunflower Oil 2L", null, 9.9, 7.4, "bottle", 10],
  ["All-Purpose Flour 2kg", "gro-flour", 3.6, 2.5, "bag", 10],
  ["Red Lentils 1kg", "gro-lentils", 3.1, 2.2, "pack", 12],
  ["Sugar 1kg", "gro-baking", 1.9, 1.35, "pack", 14],
  ["Whole Milk 1L", "dai-milk", 1.6, 1.05, "carton", 16],
  ["Cheddar Cheese 200g", null, 4.8, 3.5, "pack", 8],
  ["Greek Yogurt 500g", "dai-yogurt", 3.2, 2.1, "tub", 8],
  ["Eggs (12)", "dai-eggs", 3.4, 2.6, "tray", 10],
  ["Espresso Beans 250g", "bev-coffee", 7.5, 5.2, "bag", 6],
  ["Green Tea 50 bags", "bev-tea", 3.9, 2.4, "box", 8],
  ["Orange Juice 1L", "bev-juice", 3.5, 2.3, "carton", 10],
  ["Cola 6-pack", "bev-soft", 5.4, 3.9, "pack", 10],
  ["Sparkling Water 12x330ml", "bev-water", 6.9, 4.8, "pack", 6],
  ["Salted Peanuts 200g", "sn-nuts", 2.4, 1.5, "pack", 10],
  ["Potato Chips 150g", "sn-chips", 1.8, 1.1, "pack", 18],
  ["Chocolate Bar 90g", "sn-sweet", 2.1, 1.3, "bar", 20],
  ["Instant Noodles 5-pack", "sn-instant", 4.3, 3.0, "pack", 8],
  ["Dish Soap 750ml", "hou-clean", 2.7, 1.8, "bottle", 8],
  ["Laundry Powder 3kg", "hou-laundry", 8.9, 6.4, "box", 6],
  ["Paper Towels 6 rolls", "hou-paper", 5.6, 3.9, "pack", 8],
  ["Trash Bags 30pcs", "hou-clean", 3.3, 2.2, "roll", 10],
  ["Shampoo 400ml", "pc-hair", 5.9, 4.1, "bottle", 8],
  ["Toothpaste 120g", "pc-oral", 2.9, 1.9, "tube", 10],
  ["Bar Soap 4-pack", "pc-bath", 3.4, 2.3, "pack", 10],
  ["Hand Sanitizer 250ml", "pc-bath", 3.1, 2.0, "bottle", 8],
  ["AA Batteries 8-pack", "ele-power", 4.9, 3.2, "pack", 6],
  ["LED Bulb 9W", "ele-light", 3.6, 2.4, "unit", 8],
  ["USB-C Cable 1m", "ele-acc", 7.9, 5.1, "unit", 6],
  ["Earbuds Wired", "ele-audio", 9.9, 6.5, "unit", 5],
];

const NAMES = [
  "Amelia Hart", "Daniel Osei", "Priya Nair", "Marcus Webb", "Sofia Reyes",
  "Jonas Lindberg", "Aisha Karim", "Tomasz Nowak", "Grace Mensah", "Leo Fischer",
  "Nadia Haddad", "Ethan Cole", "Fatima Zahra", "Victor Osei", "Hana Sato",
];

const SUPPLIER_COMPANIES = [
  ["Northline Foods Ltd.", "Northline"],
  ["BrightCart Wholesale", "BrightCart"],
  ["Zenith Supplies Co.", "Zenith"],
  ["Metro Distribution", "Metro"],
  ["GreenHarvest Traders", "GreenHarvest"],
];

const EXPENSE_DEFS: [Expense["category"], string, number][] = [
  ["Rent", "Monthly shop rent", 850],
  ["Utilities", "Electricity bill", 96],
  ["Utilities", "Water and internet", 54],
  ["Salaries", "Part-time staff wages", 480],
  ["Transport", "Delivery fuel", 38],
  ["Supplies", "Carrier bags and packaging", 27],
  ["Marketing", "Flyers and local ads", 45],
  ["Maintenance", "Fridge servicing", 60],
  ["Other", "Tea and refreshments for staff", 12],
];

/** [id, name, icon, parentId] — a 3-level grocery taxonomy. */
const CATEGORIES_RAW: [string, string, string, string | null][] = [
  ["gro", "Groceries", "🛒", null],
  ["gro-rice", "Rice & Grains", "🍚", "gro"],
  ["gro-flour", "Flour & Baking", "🌾", "gro"],
  ["gro-lentils", "Lentils & Beans", "🫘", "gro"],
  ["dai", "Dairy & Eggs", "🥛", null],
  ["dai-milk", "Milk", "🥛", "dai"],
  ["dai-yogurt", "Yogurt", "🥣", "dai"],
  ["dai-eggs", "Eggs", "🥚", "dai"],
  ["bev", "Beverages", "🥤", null],
  ["bev-coffee", "Coffee", "☕", "bev"],
  ["bev-tea", "Tea", "🍵", "bev"],
  ["bev-juice", "Juices", "🧃", "bev"],
  ["bev-soft", "Soft Drinks", "🥫", "bev"],
  ["bev-water", "Water", "💧", "bev"],
  ["sn", "Snacks", "🍿", null],
  ["sn-nuts", "Nuts & Seeds", "🥜", "sn"],
  ["sn-chips", "Chips & Crisps", "🥔", "sn"],
  ["sn-sweet", "Sweets & Chocolate", "🍫", "sn"],
  ["sn-instant", "Instant Meals", "🍜", "sn"],
  ["hou", "Household", "🧻", null],
  ["hou-clean", "Cleaning", "🧼", "hou"],
  ["hou-laundry", "Laundry", "🧺", "hou"],
  ["hou-paper", "Paper & Disposables", "🧾", "hou"],
  ["pc", "Personal Care", "🧴", null],
  ["pc-hair", "Hair Care", "💇", "pc"],
  ["pc-oral", "Oral Care", "🦷", "pc"],
  ["pc-bath", "Bath & Body", "🛁", "pc"],
  ["ele", "Electronics", "🔌", null],
  ["ele-power", "Power", "🔋", "ele"],
  ["ele-light", "Lighting", "💡", "ele"],
  ["ele-acc", "Accessories", "🧵", "ele"],
  ["ele-audio", "Audio", "🎧", "ele"],
];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeedDB(): DB {
  const rand = mulberry(20260915);

  const categories: Category[] = CATEGORIES_RAW.map(([id, name, icon, parentId]) => ({
    id,
    name,
    parentId,
    icon,
    createdAt: daysAgoISO(150),
  }));

  const products: Product[] = PRODUCTS_RAW.map(([name, catId, price, cost, unit, lowAt], i) => {
    const stock = Math.floor(rand() * 60) + (i % 7 === 0 ? 0 : 6);
    const wholesale = Math.round(price * 0.9 * 100) / 100;
    const distributor = Math.round(price * 0.82 * 100) / 100;
    return {
      id: `p_${i + 1}`,
      name,
      sku: `SKU-${String(i + 1).padStart(4, "0")}`,
      categoryId: catId,
      price,
      cost,
      stock,
      lowStockAt: lowAt,
      unit,
      createdAt: daysAgoISO(120 + Math.floor(rand() * 30)),
      priceTier: { wholesale, distributor },
      // A few perishables get expiry tracking seeded in
      trackExpiry: [5, 6, 8, 11].includes(i),
      expiryDate: [5, 6, 8, 11].includes(i)
        ? new Date(Date.now() + (12 + Math.floor(rand() * 50)) * 86400000).toISOString()
        : null,
      shelfLifeDays: [5, 6, 8, 11].includes(i) ? 90 : 0,
    };
  });

  const customers: Customer[] = NAMES.slice(0, 10).map((name, i) => ({
    id: `c_${i + 1}`,
    name,
    phone: `+1 555 0${100 + i}`,
    address: `Street ${10 + i * 3}, Springfield`,
    openingDue: i % 4 === 0 ? round2(rand() * 40) : 0,
    createdAt: daysAgoISO(100 - i * 6),
    tier: (i === 0 ? "wholesale" : i === 1 ? "distributor" : "retail") as Customer["tier"],
    creditLimit: i === 0 ? 2000 : i === 1 ? 5000 : i % 4 === 0 ? 200 : 0,
    points: 20 + Math.floor(rand() * 180),
  }));

  const suppliers: Supplier[] = SUPPLIER_COMPANIES.map(([company], i) => ({
    id: `s_${i + 1}`,
    name: ["L. Grant", "R. Ahmed", "M. Silva", "K. Tan", "D. Novak"][i] ?? "Manager",
    company,
    phone: `+1 555 9${200 + i}`,
    openingDue: i % 3 === 0 ? round2(rand() * 300) : 0,
    createdAt: daysAgoISO(140 - i * 10),
  }));

  const staff: StaffMember[] = [
    { id: "u_1", name: "Omar Farouk", role: "Owner", phone: "+1 555 0100", joinedAt: daysAgoISO(400), active: true },
    { id: "u_2", name: "Elena Petrova", role: "Store Manager", phone: "+1 555 0101", joinedAt: daysAgoISO(300), active: true },
    { id: "u_3", name: "Sam Whitfield", role: "Cashier", phone: "+1 555 0102", joinedAt: daysAgoISO(150), active: true },
    { id: "u_4", name: "Amina Yusuf", role: "Cashier", phone: "+1 555 0103", joinedAt: daysAgoISO(90), active: true },
  ];

  const expenses: Expense[] = [];
  for (let d = 60; d >= 0; d--) {
    if (d % 30 === 0) {
      const [category, description, amount] = EXPENSE_DEFS[0];
      expenses.push({ id: uid("e"), at: daysAgoISO(d), category, description, amount });
      const s = EXPENSE_DEFS[3];
      expenses.push({ id: uid("e"), at: daysAgoISO(Math.min(d, 1)), category: s[0], description: s[1], amount: s[2] });
    }
    if (d % 30 === 15) {
      const [category, description, amount] = EXPENSE_DEFS[1];
      expenses.push({ id: uid("e"), at: daysAgoISO(d), category, description, amount });
      const w = EXPENSE_DEFS[2];
      expenses.push({ id: uid("e"), at: daysAgoISO(d), category: w[0], description: w[1], amount: w[2] });
    }
    if (rand() < 0.5) {
      const pool = EXPENSE_DEFS.slice(4);
      const pick = pool[Math.floor(rand() * pool.length)];
      expenses.push({
        id: uid("e"),
        at: daysAgoISO(d),
        category: pick[0],
        description: pick[1],
        amount: round2(pick[2] * (0.6 + rand() * 0.9)),
      });
    }
  }

  const sales: Sale[] = [];
  let invoice = 1000;
  const cashiers = ["Elena Petrova", "Sam Whitfield", "Amina Yusuf"];
  for (let d = 90; d >= 0; d--) {
    const weekendBoost = [0, 6].includes(new Date(daysAgoISO(d)).getDay()) ? 1.35 : 1;
    const growth = 1 + ((90 - d) / 90) * 0.4;
    const count = Math.max(2, Math.round((rand() * 6 + 3) * weekendBoost * growth));
    for (let k = 0; k < count; k++) {
      const nItems = 1 + Math.floor(rand() * 4);
      const items: SaleItem[] = [];
      for (let j = 0; j < nItems; j++) {
        const p = products[Math.floor(rand() * products.length)];
        if (items.some((it) => it.productId === p.id)) continue;
        const qty = 1 + Math.floor(rand() * 3);
        items.push({
          productId: p.id,
          name: p.name,
          unitPrice: p.price,
          unitCost: p.cost,
          qty,
          discount: 0,
        });
      }
      if (items.length === 0) continue;
      const subtotal = round2(items.reduce((s, it) => s + it.unitPrice * it.qty, 0));
      const discount = rand() < 0.18 ? round2(rand() * 2 + 0.5) : 0;
      const total = round2(subtotal - discount);
      const costTotal = round2(items.reduce((s, it) => s + it.unitCost * it.qty, 0));
      const isDue = rand() < 0.09;
      const pay: Sale["payment"] = isDue ? "Due" : rand() < 0.62 ? "Cash" : rand() < 0.55 ? "Card" : "Mobile Money";
      const customer = isDue
        ? customers[Math.floor(rand() * customers.length)]
        : rand() < 0.35
          ? customers[Math.floor(rand() * customers.length)]
          : null;
      const paidAmount = isDue ? (rand() < 0.4 ? round2(total * 0.5) : 0) : total;
      sales.push({
        id: uid("sale"),
        invoiceNo: `INV-${++invoice}`,
        at: daysAgoISO(d, 9 + Math.floor(rand() * 10)),
        items,
        subtotal,
        discount,
        tax: 0,
        shipping: 0,
        total,
        costTotal,
        profit: round2(total - costTotal),
        payment: pay,
        customerId: customer?.id ?? null,
        note: "",
        cashier: cashiers[Math.floor(rand() * cashiers.length)],
        status: isDue ? (paidAmount >= total ? "Paid" : paidAmount > 0 ? "Partially Paid" : "Unpaid") : "Paid",
        paidAmount,
        signature: null,
        delivery: null,
      });
    }
  }

  const purchases: Purchase[] = [];
  let ref = 5000;
  for (let d = 84; d >= 0; d -= 7) {
    const supplier = suppliers[Math.floor(rand() * suppliers.length)];
    const nItems = 3 + Math.floor(rand() * 5);
    const items = Array.from({ length: nItems }, () => {
      const p = products[Math.floor(rand() * products.length)];
      return { productId: p.id, name: p.name, unitCost: p.cost, qty: 10 + Math.floor(rand() * 40) };
    });
    const subtotal = round2(items.reduce((s, it) => s + it.unitCost * it.qty, 0));
    const shipping = round2(rand() * 20 + 5);
    const isDue = rand() < 0.3;
    const paidAmount = isDue ? (rand() < 0.5 ? round2(subtotal * 0.5) : 0) : subtotal + shipping;
    purchases.push({
      id: uid("po"),
      refNo: `PO-${++ref}`,
      at: daysAgoISO(d, 11),
      supplierId: supplier.id,
      items,
      subtotal,
      shipping,
      total: round2(subtotal + shipping),
      payment: isDue ? "Due" : "Paid",
      paidAmount,
      note: "",
    });
  }

  const now = new Date();
  const branches: Branch[] = [
    { id: "br-main", name: "Main Branch", address: "Central Market Road", createdAt: daysAgoISO(400) },
    { id: "br-2", name: "Riverside Outlet", address: "12 Riverside Drive", createdAt: daysAgoISO(180) },
  ];
  return {
    products,
    categories,
    sales,
    purchases,
    customers,
    suppliers,
    expenses,
    staff,
    subscription: {
      tier: "trial",
      status: "trialing",
      billingCycle: null,
      startedAt: now.toISOString(),
      currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString(),
      autoRenew: false,
      paymentMethod: null,
      couponCode: null,
      couponRedeemsLeft: 0,
      canceledAt: null,
    },
    subInvoices: [],
    saleReturns: [],
    purchaseReturns: [],
    branches,
    accounts: defaultAccounts({ staff: [{ id: "st-owner", name: "Omar Farouk" }] }),
    audit: [
      {
        id: uid("aud"),
        at: daysAgoISO(0, 9),
        actor: "Owner",
        action: "login",
        entity: "Session",
        ref: "owner",
        detail: "Signed in at shop terminal",
      },
    ],
    trash: [],
    wallet: [
      { id: uid("wtx"), at: daysAgoISO(0, 10), channel: "bKash", kind: "in", amount: 1250, fee: 0, ref: "BKX8QW2M", note: "Customer payment — INV-1042", linkedSaleId: null },
      { id: uid("wtx"), at: daysAgoISO(1, 15), channel: "Nagad", kind: "in", amount: 2100, fee: 0, ref: "NGP41KKL", note: "Customer payment — INV-1039", linkedSaleId: null },
      { id: uid("wtx"), at: daysAgoISO(2, 12), channel: "bKash", kind: "out", amount: 6000, fee: 111, ref: "BKZ77HAD", note: "Supplier payment — Fresh Distributors", linkedSaleId: null },
      { id: uid("wtx"), at: daysAgoISO(4, 9), channel: "Bank", kind: "out", amount: 18000, fee: 0, ref: "BNK-TR-88410", note: "Shop rent transfer", linkedSaleId: null },
    ],
    walletAccounts: [
      { channel: "bKash", number: "01712-345678" },
      { channel: "Nagad", number: "01812-345678" },
      { channel: "Bank", number: "BRAC 1501-2030-4567" },
    ],
    threads: [
      {
        id: uid("thr"),
        party: "customer",
        partyId: "c-1",
        messages: [
          { id: uid("cm"), at: daysAgoISO(1, 11), from: "me", text: "Assalamu alaikum! Your order INV-1035 is ready for pickup.", kind: "chat" },
          { id: uid("cm"), at: daysAgoISO(1, 12), from: "them", text: "Thanks! I'll come by this evening inshaAllah.", kind: "chat" },
        ],
        unread: 0,
        updatedAt: daysAgoISO(1, 12),
      },
    ],
    reminders: [],
    campaigns: [
      {
        id: uid("cmp"),
        at: daysAgoISO(3, 17),
        title: "Eid discount week",
        body: "Get 10% off on all groceries this week at Bright Leaf Market!",
        audience: "all",
        count: 28,
        channel: "sms",
      },
    ],
    storefront: {
      ...defaultStorefront(),
      enabled: true,
      slug: "bright-leaf",
      theme: {
        accent: "#1f6a4c",
        hero: "Fresh groceries from Bright Leaf — same-day delivery in Dhaka.",
        banner: null,
        font: "modern",
      },
      minOrder: 300,
      deliveryFee: 40,
    },
    storefrontOrders: [
      {
        id: uid("sfo"),
        at: daysAgoISO(0, 9),
        customerName: "Nusrat Jahan",
        phone: "01911223344",
        address: "House 12, Road 5, Dhanmondi",
        items: [
          { productId: "p-1", name: "Basmati Rice 5kg", price: 18.5, qty: 2 },
          { productId: "p-6", name: "Whole Milk 1L", price: 1.6, qty: 4 },
        ],
        total: round2(18.5 * 2 + 1.6 * 4 + 40),
        status: "New",
        note: "Please call before delivery",
      },
      {
        id: uid("sfo"),
        at: daysAgoISO(1, 16),
        customerName: "Rakib Hasan",
        phone: "01633445566",
        address: "Flat B4, Lalmatia",
        items: [{ productId: "p-15", name: "Salted Peanuts 200g", price: 2.4, qty: 3 }],
        total: round2(2.4 * 3 + 40),
        status: "Delivered",
        note: "",
      },
    ],
    onboarding: null,
    settings: {
      shopName: "Bright Leaf Market",
      tagline: "Grocery & Household",
      currency: "$",
      taxRate: 0,
      lowStockDefault: 10,
      ownerName: "Omar Farouk",
      monthlyTarget: 6000,
      branches: 2,
      loyaltyEnabled: true,
      loyaltyRate: 1,
      pointValue: 0.01,
      /* branding & invoices */
      logo: null,
      ownerImage: null,
      address: "142 Green Road, Farmgate, Dhaka 1205",
      phone: "+880 1712 345 678",
      email: "hello@brightleaf.market",
      website: "brightleaf.market",
      regNo: "BIN 004512789-0201",
      invoiceNote: "Goods once sold are returnable within 7 days with this invoice. Thank you for shopping with us!",
    },
  };
}
