import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, formatEther, getAddress, http, parseEther, type Hash } from "viem";
import { mantleSepolia } from "./mantle-sepolia";
import type { Customer, FestivalState, PaymentMode, PaymentRecord, Shop } from "./festival-types";

const DATA_DIR = path.join(process.cwd(), "data");
const FESTIVALS_DIR = path.join(DATA_DIR, "festivals");
const LEGACY_DATA_FILE = path.join(DATA_DIR, "festival-state.json");
const DEFAULT_FESTIVAL_ID = "wagaya";
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

export function normalizeFestivalId(value?: string | null) {
  const normalized = (value || DEFAULT_FESTIVAL_ID)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return normalized || DEFAULT_FESTIVAL_ID;
}

function isAddressLike(value?: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function toMntAmount(value: number) {
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizePayment(payment: PaymentRecord): PaymentRecord {
  const status = (payment as { status: string }).status;

  if (status === "pending") {
    return { ...payment, status: payment.transactionHash ? "submitted" : "pending_wallet" };
  }

  return payment;
}

export function createCustomer(customerId: string, count: number): Customer {
  return {
    id: customerId,
    name: `おきゃくさん ${count + 1}`,
    balanceMnt: INITIAL_BALANCE,
    createdAt: new Date().toISOString(),
  };
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url: url.replace(/\/$/, ""), token };
}

function getRedisKey(festivalId: string) {
  return `mantle-natsumatsuri:festival:${normalizeFestivalId(festivalId)}`;
}

function getFestivalFile(festivalId: string) {
  return path.join(FESTIVALS_DIR, `${normalizeFestivalId(festivalId)}.json`);
}

async function readStoredState(festivalId: string) {
  const redis = getRedisConfig();

  if (redis) {
    const response = await fetch(`${redis.url}/get/${encodeURIComponent(getRedisKey(festivalId))}`, {
      headers: {
        Authorization: `Bearer ${redis.token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("redis_read_failed");
    }

    const payload = (await response.json()) as { result: string | null };
    return payload.result;
  }

  return readFile(getFestivalFile(festivalId), "utf8");
}

async function saveState(festivalId: string, state: FestivalState) {
  const redis = getRedisConfig();

  if (redis) {
    const response = await fetch(`${redis.url}/set/${encodeURIComponent(getRedisKey(festivalId))}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      throw new Error("redis_write_failed");
    }

    return;
  }

  await mkdir(FESTIVALS_DIR, { recursive: true });
  await writeFile(getFestivalFile(festivalId), JSON.stringify(state, null, 2));
}

export async function deleteFestivalState(festivalId: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const redis = getRedisConfig();

  if (redis) {
    const response = await fetch(`${redis.url}/del/${encodeURIComponent(getRedisKey(normalizedFestivalId))}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("redis_delete_failed");
    }

    return { ok: true as const, festivalId: normalizedFestivalId };
  }

  try {
    await unlink(getFestivalFile(normalizedFestivalId));
  } catch {
    // Deleting an already-missing festival should still return the user to the app top.
  }

  return { ok: true as const, festivalId: normalizedFestivalId };
}

function normalizeState(parsed: Partial<FestivalState>): FestivalState {
  return {
    festivalName: parsed.festivalName || initialState.festivalName,
    exchangeRateJpyPerMnt:
      typeof parsed.exchangeRateJpyPerMnt === "number" && parsed.exchangeRateJpyPerMnt > 0
        ? parsed.exchangeRateJpyPerMnt
        : initialState.exchangeRateJpyPerMnt,
    paymentMode: parsed.paymentMode === "mantle-sepolia" ? "mantle-sepolia" : "demo",
    shops: Array.isArray(parsed.shops) && parsed.shops.length > 0 ? parsed.shops : defaultShops,
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments.map(normalizePayment) : [],
  };
}

export async function readState(festivalId = DEFAULT_FESTIVAL_ID): Promise<FestivalState> {
  const normalizedFestivalId = normalizeFestivalId(festivalId);

  try {
    const raw = await readStoredState(normalizedFestivalId);
    if (!raw) {
      throw new Error("festival_not_found");
    }

    const parsed = JSON.parse(raw) as Partial<FestivalState>;

    return normalizeState(parsed);
  } catch {
    if (normalizedFestivalId === DEFAULT_FESTIVAL_ID && !getRedisConfig()) {
      try {
        const legacyRaw = await readFile(LEGACY_DATA_FILE, "utf8");
        const legacyState = normalizeState(JSON.parse(legacyRaw) as Partial<FestivalState>);
        await saveState(normalizedFestivalId, legacyState);
        return legacyState;
      } catch {
        // Continue to fresh initial state.
      }
    }

    await saveState(normalizedFestivalId, initialState);
    return initialState;
  }
}

export async function ensureCustomer(festivalId: string, customerId: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const currentCustomer = state.customers.find((customer) => customer.id === customerId);

  if (currentCustomer) {
    return { ...state, festivalId: normalizedFestivalId, currentCustomer };
  }

  const nextCustomer = createCustomer(customerId, state.customers.length);
  const nextState = {
    ...state,
    customers: [...state.customers, nextCustomer],
  };
  await saveState(normalizedFestivalId, nextState);

  return { ...nextState, festivalId: normalizedFestivalId, currentCustomer: nextCustomer };
}

export async function updateSettings(
  festivalId: string,
  nextSettings: Pick<FestivalState, "festivalName" | "exchangeRateJpyPerMnt" | "paymentMode" | "shops">,
) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const nextState: FestivalState = {
    ...state,
    festivalName: nextSettings.festivalName,
    exchangeRateJpyPerMnt: Math.max(1, nextSettings.exchangeRateJpyPerMnt),
    paymentMode: nextSettings.paymentMode,
    shops: nextSettings.shops.length > 0 ? nextSettings.shops : state.shops,
  };

  await saveState(normalizedFestivalId, nextState);
  return nextState;
}

type PurchaseChainData = {
  mode?: PaymentMode;
  status?: PaymentRecord["status"];
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  payerAddress?: string;
};

export async function recordPurchase(festivalId: string, customerId: string, shopId: string, chainData: PurchaseChainData = {}) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const customer = state.customers.find((item) => item.id === customerId);
  const shop = state.shops.find((item) => item.id === shopId);

  if (!customer || !shop) {
    return { ok: false as const, reason: "not_found", state };
  }

  const priceMnt = calculateMntPrice(shop.priceJpy, state.exchangeRateJpyPerMnt);
  if (chainData.mode !== "mantle-sepolia" && customer.balanceMnt < priceMnt) {
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
    payerAddress: chainData.payerAddress,
    transactionHash: chainData.transactionHash,
    blockNumber: chainData.blockNumber,
    gasUsed: chainData.gasUsed,
  };

  const nextState: FestivalState = {
    ...state,
    customers:
      chainData.mode === "mantle-sepolia"
        ? state.customers
        : state.customers.map((item) =>
            item.id === customer.id ? { ...item, balanceMnt: Math.max(0, item.balanceMnt - priceMnt) } : item,
          ),
    payments: [payment, ...state.payments],
  };
  await saveState(normalizedFestivalId, nextState);

  return { ok: true as const, payment, state: nextState };
}

export async function createOnchainOrder(festivalId: string, customerId: string, shopId: string, payerAddress: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const customer = state.customers.find((item) => item.id === customerId);
  const shop = state.shops.find((item) => item.id === shopId);

  if (!customer || !shop) {
    return { ok: false as const, reason: "not_found", state };
  }

  if (!isAddressLike(shop.recipientAddress)) {
    return { ok: false as const, reason: "recipient_missing", state };
  }

  if (!isAddressLike(payerAddress)) {
    return { ok: false as const, reason: "payer_missing", state };
  }

  const priceMnt = calculateMntPrice(shop.priceJpy, state.exchangeRateJpyPerMnt);
  const now = new Date().toISOString();
  const payment: PaymentRecord = {
    id: createId("order"),
    customerId: customer.id,
    customerName: customer.name,
    shopId: shop.id,
    itemName: shop.name,
    priceJpy: shop.priceJpy,
    priceMnt,
    exchangeRateJpyPerMnt: state.exchangeRateJpyPerMnt,
    quantity: 1,
    createdAt: now,
    mode: "mantle-sepolia",
    status: "pending_wallet",
    recipientAddress: shop.recipientAddress,
    payerAddress,
  };

  const nextState = {
    ...state,
    payments: [payment, ...state.payments],
  };
  await saveState(normalizedFestivalId, nextState);

  return { ok: true as const, payment, state: nextState };
}

export async function markOrderSubmitted(festivalId: string, orderId: string, transactionHash: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const payment = state.payments.find((item) => item.id === orderId);

  if (!payment || payment.mode !== "mantle-sepolia") {
    return { ok: false as const, reason: "not_found", state };
  }

  const now = new Date().toISOString();
  const nextState: FestivalState = {
    ...state,
    payments: state.payments.map((item) =>
      item.id === orderId
        ? {
            ...item,
            status: "submitted",
            transactionHash,
            submittedAt: now,
          }
        : item,
    ),
  };
  await saveState(normalizedFestivalId, nextState);

  return { ok: true as const, payment: nextState.payments.find((item) => item.id === orderId), state: nextState };
}

export async function rejectOrder(festivalId: string, orderId: string, errorMessage?: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const now = new Date().toISOString();
  const nextState: FestivalState = {
    ...state,
    payments: state.payments.map((item) =>
      item.id === orderId && item.status !== "confirmed" && item.status !== "completed"
        ? {
            ...item,
            status: "rejected",
            completedAt: now,
            errorMessage,
          }
        : item,
    ),
  };
  await saveState(normalizedFestivalId, nextState);

  return { ok: true as const, state: nextState };
}

export async function verifyOnchainOrder(festivalId: string, orderId: string, transactionHash: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const payment = state.payments.find((item) => item.id === orderId);

  if (!payment || payment.mode !== "mantle-sepolia") {
    return { ok: false as const, reason: "not_found", state };
  }

  if (!payment.recipientAddress || !payment.payerAddress) {
    return { ok: false as const, reason: "payment_details_missing", state };
  }

  const publicClient = createPublicClient({
    chain: mantleSepolia,
    transport: http(),
  });
  const [tx, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: transactionHash as Hash }),
    publicClient.getTransactionReceipt({ hash: transactionHash as Hash }),
  ]);
  const expectedValue = parseEther(toMntAmount(payment.priceMnt));
  const fromMatches = getAddress(tx.from) === getAddress(payment.payerAddress);
  const toMatches = tx.to ? getAddress(tx.to) === getAddress(payment.recipientAddress) : false;
  const valueMatches = tx.value >= expectedValue;
  const confirmed = receipt.status === "success" && fromMatches && toMatches && valueMatches;
  const now = new Date().toISOString();
  const nextStatus: PaymentRecord["status"] = confirmed ? "confirmed" : "failed";
  const nextState: FestivalState = {
    ...state,
    payments: state.payments.map((item) =>
      item.id === orderId
        ? {
            ...item,
            status: nextStatus,
            transactionHash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            confirmedAt: confirmed ? now : item.confirmedAt,
            errorMessage: confirmed
              ? undefined
              : `Tx check failed: from=${fromMatches}, to=${toMatches}, value=${valueMatches}, receipt=${receipt.status}, value=${formatEther(tx.value)} MNT`,
          }
        : item,
    ),
  };
  await saveState(normalizedFestivalId, nextState);

  return { ok: confirmed, reason: confirmed ? undefined : "tx_verification_failed", state: nextState };
}

export async function completeOrder(festivalId: string, orderId: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const payment = state.payments.find((item) => item.id === orderId);

  if (!payment) {
    return { ok: false as const, reason: "not_found", state };
  }

  const canComplete =
    payment.mode === "demo" || payment.status === "recorded" || payment.status === "confirmed" || payment.status === "completed";

  if (!canComplete) {
    return { ok: false as const, reason: "not_confirmed", state };
  }

  const now = new Date().toISOString();
  const nextState: FestivalState = {
    ...state,
    payments: state.payments.map((item) =>
      item.id === orderId
        ? {
            ...item,
            status: "completed",
            completedAt: item.completedAt || now,
          }
        : item,
    ),
  };
  await saveState(normalizedFestivalId, nextState);

  return { ok: true as const, state: nextState };
}

export async function resetFestivalActivity(festivalId: string) {
  const normalizedFestivalId = normalizeFestivalId(festivalId);
  const state = await readState(normalizedFestivalId);
  const nextState: FestivalState = {
    ...state,
    customers: state.customers.map((customer) => ({ ...customer, balanceMnt: INITIAL_BALANCE })),
    payments: [],
  };

  await saveState(normalizedFestivalId, nextState);
  return nextState;
}
