import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Customer, FestivalState, PaymentMode, PaymentRecord, Shop } from "./festival-types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "festival-state.json");
const INITIAL_BALANCE = 10;
const INITIAL_EXCHANGE_RATE = 100;

export const defaultShops: Shop[] = [
  {
    id: "takoyaki",
    emoji: "🐙",
    name: "たこやき",
    description: "3こ",
    priceJpy: 200,
    actionLabel: "かう！",
  },
  {
    id: "popcorn",
    emoji: "🍿",
    name: "ポップコーン",
    description: "1こ",
    priceJpy: 100,
    actionLabel: "かう！",
  },
  {
    id: "wanage",
    emoji: "⭕",
    name: "わなげ",
    description: "3かい",
    priceJpy: 100,
    actionLabel: "あそぶ！",
  },
];

const initialState: FestivalState = {
  festivalName: "わがやのなつまつり",
  exchangeRateJpyPerMnt: INITIAL_EXCHANGE_RATE,
  paymentMode: "demo",
  shops: defaultShops,
  customers: [],
  payments: [],
};

export function calculateMntPrice(priceJpy: number, exchangeRateJpyPerMnt: number) {
  return priceJpy / Math.max(1, exchangeRateJpyPerMnt);
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createCustomer(customerId: string, count: number): Customer {
  return {
    id: customerId,
    name: `おきゃくさん ${count + 1}`,
    balanceMnt: INITIAL_BALANCE,
    createdAt: new Date().toISOString(),
  };
}

async function saveState(state: FestivalState) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(state, null, 2));
}

export async function readState(): Promise<FestivalState> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<FestivalState>;

    return {
      festivalName: parsed.festivalName || initialState.festivalName,
      exchangeRateJpyPerMnt:
        typeof parsed.exchangeRateJpyPerMnt === "number" && parsed.exchangeRateJpyPerMnt > 0
          ? parsed.exchangeRateJpyPerMnt
          : initialState.exchangeRateJpyPerMnt,
      paymentMode: parsed.paymentMode === "mantle-sepolia" ? "mantle-sepolia" : "demo",
      shops: Array.isArray(parsed.shops) && parsed.shops.length > 0 ? parsed.shops : defaultShops,
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
    };
  } catch {
    await saveState(initialState);
    return initialState;
  }
}

export async function ensureCustomer(customerId: string) {
  const state = await readState();
  const currentCustomer = state.customers.find((customer) => customer.id === customerId);

  if (currentCustomer) {
    return { ...state, currentCustomer };
  }

  const nextCustomer = createCustomer(customerId, state.customers.length);
  const nextState = {
    ...state,
    customers: [...state.customers, nextCustomer],
  };
  await saveState(nextState);

  return { ...nextState, currentCustomer: nextCustomer };
}

export async function updateSettings(
  nextSettings: Pick<FestivalState, "festivalName" | "exchangeRateJpyPerMnt" | "paymentMode" | "shops">,
) {
  const state = await readState();
  const nextState: FestivalState = {
    ...state,
    festivalName: nextSettings.festivalName,
    exchangeRateJpyPerMnt: Math.max(1, nextSettings.exchangeRateJpyPerMnt),
    paymentMode: nextSettings.paymentMode,
    shops: nextSettings.shops.length > 0 ? nextSettings.shops : state.shops,
  };

  await saveState(nextState);
  return nextState;
}

type PurchaseChainData = {
  mode?: PaymentMode;
  status?: PaymentRecord["status"];
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
};

export async function recordPurchase(customerId: string, shopId: string, chainData: PurchaseChainData = {}) {
  const state = await readState();
  const customer = state.customers.find((item) => item.id === customerId);
  const shop = state.shops.find((item) => item.id === shopId);

  if (!customer || !shop) {
    return { ok: false as const, reason: "not_found", state };
  }

  const priceMnt = calculateMntPrice(shop.priceJpy, state.exchangeRateJpyPerMnt);
  if (customer.balanceMnt < priceMnt) {
    return { ok: false as const, reason: "not_enough_mnt", state };
  }

  const payment: PaymentRecord = {
    id: createId("pay"),
    customerId: customer.id,
    customerName: customer.name,
    shopId: shop.id,
    itemName: shop.name,
    priceJpy: shop.priceJpy,
    priceMnt,
    exchangeRateJpyPerMnt: state.exchangeRateJpyPerMnt,
    quantity: 1,
    createdAt: new Date().toISOString(),
    mode: chainData.mode || state.paymentMode,
    status: chainData.status || (chainData.mode === "mantle-sepolia" ? "confirmed" : "recorded"),
    recipientAddress: shop.recipientAddress,
    transactionHash: chainData.transactionHash,
    blockNumber: chainData.blockNumber,
    gasUsed: chainData.gasUsed,
  };

  const nextState: FestivalState = {
    ...state,
    customers: state.customers.map((item) =>
      item.id === customer.id ? { ...item, balanceMnt: Math.max(0, item.balanceMnt - priceMnt) } : item,
    ),
    payments: [payment, ...state.payments],
  };
  await saveState(nextState);

  return { ok: true as const, payment, state: nextState };
}

export async function resetFestivalActivity() {
  const state = await readState();
  const nextState: FestivalState = {
    ...state,
    customers: state.customers.map((customer) => ({ ...customer, balanceMnt: INITIAL_BALANCE })),
    payments: [],
  };

  await saveState(nextState);
  return nextState;
}
