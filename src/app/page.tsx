"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseEther, type Address, type EIP1193Provider } from "viem";
import type { Customer, FestivalResponse, FestivalState, PaymentMode, Shop, ShopStats } from "@/lib/festival-types";
import { mantleSepolia, mantleSepoliaAddChainParameter } from "@/lib/mantle-sepolia";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type Screen = "home" | "customer" | "merchant" | "settings";

const INITIAL_EXCHANGE_RATE = 100;
const CUSTOMER_STORAGE_KEY = "mantle-natsumatsuri-customer-id";

const fallbackShops: Shop[] = [
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
  shops: fallbackShops,
  customers: [],
  payments: [],
};

const fallbackCustomer: Customer = {
  id: "loading",
  name: "おきゃくさん",
  balanceMnt: 10,
  createdAt: new Date(0).toISOString(),
};

function getCustomerId() {
  if (typeof window === "undefined") {
    return fallbackCustomer.id;
  }

  const saved = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
  const customerId = saved || createId("customer");
  window.localStorage.setItem(CUSTOMER_STORAGE_KEY, customerId);
  return customerId;
}

async function fetchFestival(customerId: string) {
  const response = await fetch(`/api/festival?customerId=${encodeURIComponent(customerId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("festival_fetch_failed");
  }

  return (await response.json()) as FestivalResponse;
}

function formatMnt(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function formatYen(value: number) {
  return new Intl.NumberFormat("ja-JP").format(Math.round(value));
}

function calculateMntPrice(priceJpy: number, exchangeRateJpyPerMnt: number) {
  return priceJpy / Math.max(1, exchangeRateJpyPerMnt);
}

function isAddressLike(value?: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function toMntAmount(value: number) {
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function shortHash(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensureMantleSepolia(provider: EIP1193Provider) {
  const chainId = await provider.request({ method: "eth_chainId" });

  if (chainId === mantleSepoliaAddChainParameter.chainId) {
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: mantleSepoliaAddChainParameter.chainId }],
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

    if (code !== 4902) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [mantleSepoliaAddChainParameter],
    });
  }
}

async function sendMantleSepoliaPayment(shop: Shop, priceMnt: number) {
  const provider = window.ethereum;

  if (!provider) {
    throw new Error("wallet_missing");
  }

  if (!isAddressLike(shop.recipientAddress)) {
    throw new Error("recipient_missing");
  }

  await ensureMantleSepolia(provider);

  const walletClient = createWalletClient({
    chain: mantleSepolia,
    transport: custom(provider),
  });
  const [account] = await walletClient.requestAddresses();
  const hash = await walletClient.sendTransaction({
    account,
    to: shop.recipientAddress as Address,
    value: parseEther(toMntAmount(priceMnt)),
  });

  const publicClient = createPublicClient({
    chain: mantleSepolia,
    transport: http(),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    transactionHash: hash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === "success" ? ("confirmed" as const) : ("failed" as const),
  };
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [festival, setFestival] = useState<FestivalState>(initialState);
  const [currentCustomer, setCurrentCustomer] = useState<Customer>(fallbackCustomer);
  const [selectedShopId, setSelectedShopId] = useState(fallbackShops[0].id);
  const [confirmShopId, setConfirmShopId] = useState<string | null>(null);
  const [successItemName, setSuccessItemName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("共有データをよみこみ中");

  useEffect(() => {
    let isActive = true;
    const customerId = getCustomerId();

    async function refresh() {
      try {
        const nextFestival = await fetchFestival(customerId);
        if (!isActive) {
          return;
        }
        setFestival({
          festivalName: nextFestival.festivalName,
          exchangeRateJpyPerMnt: nextFestival.exchangeRateJpyPerMnt,
          paymentMode: nextFestival.paymentMode,
          shops: nextFestival.shops,
          customers: nextFestival.customers,
          payments: nextFestival.payments,
        });
        setCurrentCustomer(nextFestival.currentCustomer);
        setSelectedShopId((current) => nextFestival.shops.find((shop) => shop.id === current)?.id || nextFestival.shops[0]?.id || "");
        setStatusMessage("");
      } catch {
        if (isActive) {
          setStatusMessage("共有データにつながりません");
        }
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 1500);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, []);

  const effectiveSelectedShopId = festival.shops.some((shop) => shop.id === selectedShopId)
    ? selectedShopId
    : festival.shops[0]?.id || "";
  const confirmShop = festival.shops.find((shop) => shop.id === confirmShopId) || null;

  const shopStats = useMemo(() => {
    return festival.shops.map((shop) => {
      const records = festival.payments.filter((payment) => payment.shopId === shop.id);
      const sales = records.reduce((sum, payment) => sum + payment.priceMnt * payment.quantity, 0);

      return {
        shop,
        records,
        sales,
        count: records.length,
      };
    });
  }, [festival.payments, festival.shops]);

  const festivalTotal = shopStats.reduce((sum, item) => sum + item.sales, 0);
  const selectedStats = shopStats.find((item) => item.shop.id === effectiveSelectedShopId) || shopStats[0];

  async function refreshFestival() {
    const nextFestival = await fetchFestival(currentCustomer.id);
    setFestival({
      festivalName: nextFestival.festivalName,
      exchangeRateJpyPerMnt: nextFestival.exchangeRateJpyPerMnt,
      paymentMode: nextFestival.paymentMode,
      shops: nextFestival.shops,
      customers: nextFestival.customers,
      payments: nextFestival.payments,
    });
    setCurrentCustomer(nextFestival.currentCustomer);
  }

  async function completePurchase(shop: Shop) {
    const priceMnt = calculateMntPrice(shop.priceJpy, festival.exchangeRateJpyPerMnt);

    if (currentCustomer.balanceMnt < priceMnt) {
      setConfirmShopId(null);
      return;
    }

    setConfirmShopId(null);
    setStatusMessage(festival.paymentMode === "mantle-sepolia" ? "MNTのおさいふを開いています" : "おみせに送っています");

    try {
      const chainData =
        festival.paymentMode === "mantle-sepolia"
          ? await sendMantleSepoliaPayment(shop, priceMnt)
          : {
              status: "recorded" as const,
            };

      if (chainData.status === "failed") {
        setStatusMessage("MNTを送れませんでした");
        await refreshFestival();
        return;
      }

      setStatusMessage("おみせに記録しています");
      const response = await fetch("/api/festival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "purchase",
          customerId: currentCustomer.id,
          shopId: shop.id,
          mode: festival.paymentMode,
          status: chainData.status,
          transactionHash: "transactionHash" in chainData ? chainData.transactionHash : undefined,
          blockNumber: "blockNumber" in chainData ? chainData.blockNumber : undefined,
          gasUsed: "gasUsed" in chainData ? chainData.gasUsed : undefined,
        }),
      });

      if (!response.ok) {
        setStatusMessage("MNTがたりません");
        await refreshFestival();
        return;
      }

      setSuccessItemName(shop.name);
      setStatusMessage("");
      await refreshFestival();
    } catch (error) {
      if (error instanceof Error && error.message === "wallet_missing") {
        setStatusMessage("MNTのおさいふが見つかりません");
        return;
      }
      if (error instanceof Error && error.message === "recipient_missing") {
        setStatusMessage("おみせの受け取り先がありません");
        return;
      }
      setStatusMessage(festival.paymentMode === "mantle-sepolia" ? "MNTを送れませんでした" : "おみせにつながりません");
    }
  }

  async function saveSettings(
    nextSettings: Pick<FestivalState, "festivalName" | "exchangeRateJpyPerMnt" | "paymentMode" | "shops">,
  ) {
    setFestival((current) => ({ ...current, ...nextSettings }));
    setStatusMessage("設定を保存中");

    try {
      await fetch("/api/festival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          ...nextSettings,
        }),
      });
      setStatusMessage("");
    } catch {
      setStatusMessage("設定を保存できません");
    }
  }

  function updateFestivalName(festivalName: string) {
    void saveSettings({
      festivalName,
      exchangeRateJpyPerMnt: festival.exchangeRateJpyPerMnt,
      paymentMode: festival.paymentMode,
      shops: festival.shops,
    });
  }

  function updateExchangeRate(exchangeRateJpyPerMnt: number) {
    void saveSettings({
      festivalName: festival.festivalName,
      exchangeRateJpyPerMnt,
      paymentMode: festival.paymentMode,
      shops: festival.shops,
    });
  }

  function updatePaymentMode(paymentMode: PaymentMode) {
    void saveSettings({
      festivalName: festival.festivalName,
      exchangeRateJpyPerMnt: festival.exchangeRateJpyPerMnt,
      paymentMode,
      shops: festival.shops,
    });
  }

  function updateShop(shopId: string, nextShop: Partial<Shop>) {
    const shops = festival.shops.map((shop) => (shop.id === shopId ? { ...shop, ...nextShop } : shop));
    void saveSettings({
      festivalName: festival.festivalName,
      exchangeRateJpyPerMnt: festival.exchangeRateJpyPerMnt,
      paymentMode: festival.paymentMode,
      shops,
    });
  }

  function addShop() {
    const shop: Shop = {
      id: createId("shop"),
      emoji: "🏮",
      name: "あたらしいおみせ",
      description: "1こ",
      priceJpy: festival.exchangeRateJpyPerMnt,
      actionLabel: "かう！",
    };

    void saveSettings({
      festivalName: festival.festivalName,
      exchangeRateJpyPerMnt: festival.exchangeRateJpyPerMnt,
      paymentMode: festival.paymentMode,
      shops: [...festival.shops, shop],
    });
    setSelectedShopId(shop.id);
  }

  function deleteShop(shopId: string) {
    if (festival.shops.length <= 1) {
      return;
    }

    const shops = festival.shops.filter((shop) => shop.id !== shopId);
    void saveSettings({
      festivalName: festival.festivalName,
      exchangeRateJpyPerMnt: festival.exchangeRateJpyPerMnt,
      paymentMode: festival.paymentMode,
      shops,
    });
  }

  async function resetDemo() {
    setSuccessItemName(null);
    setConfirmShopId(null);
    setStatusMessage("残高と履歴をリセット中");

    try {
      await fetch("/api/festival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      setStatusMessage("");
      await refreshFestival();
    } catch {
      setStatusMessage("リセットできません");
    }
  }

  return (
    <main className="min-h-dvh bg-[#fff8e8] text-[#20140c]">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
        {screen !== "home" ? (
          <header className="sticky top-0 z-20 border-b border-[#ead7aa] bg-[#fff8e8]/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <button
                className="touch-button small-button"
                type="button"
                onClick={() => setScreen(screen === "settings" ? "merchant" : "home")}
              >
                もどる
              </button>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#96631d]">Mantleなつまつり</p>
                <p className="max-w-[13rem] truncate text-lg font-black sm:max-w-none">{festival.festivalName}</p>
              </div>
              {screen === "merchant" ? (
                <button className="touch-button small-button" type="button" onClick={() => setScreen("settings")}>
                  設定
                </button>
              ) : (
                <div className="min-w-[4.5rem]" aria-hidden="true" />
              )}
            </div>
          </header>
        ) : null}

        {screen === "home" ? (
          <HomeScreen festivalName={festival.festivalName} onNavigate={setScreen} />
        ) : null}

        {screen === "customer" ? (
          <CustomerScreen
            customer={currentCustomer}
            exchangeRateJpyPerMnt={festival.exchangeRateJpyPerMnt}
            paymentMode={festival.paymentMode}
            shops={festival.shops}
            successItemName={successItemName}
            statusMessage={statusMessage}
            onCloseSuccess={() => setSuccessItemName(null)}
            onPickShop={(shopId) => setConfirmShopId(shopId)}
          />
        ) : null}

        {screen === "merchant" ? (
          <MerchantScreen
            selectedShopId={effectiveSelectedShopId}
            selectedStats={selectedStats}
            shopStats={shopStats}
            total={festivalTotal}
            exchangeRateJpyPerMnt={festival.exchangeRateJpyPerMnt}
            paymentMode={festival.paymentMode}
            onSelectShop={setSelectedShopId}
          />
        ) : null}

        {screen === "settings" ? (
          <SettingsScreen
            festival={festival}
            statusMessage={statusMessage}
            onFestivalNameChange={updateFestivalName}
            onExchangeRateChange={updateExchangeRate}
            onPaymentModeChange={updatePaymentMode}
            onShopChange={updateShop}
            onAddShop={addShop}
            onDeleteShop={deleteShop}
            onResetDemo={() => void resetDemo()}
          />
        ) : null}
      </div>

      {confirmShop ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/45 px-4">
          <section className="w-full max-w-sm rounded-[24px] bg-white p-5 text-center shadow-2xl">
            <div className="text-6xl">{confirmShop.emoji}</div>
            <h2 className="mt-3 text-2xl font-black">
              {confirmShop.name}を {formatMnt(calculateMntPrice(confirmShop.priceJpy, festival.exchangeRateJpyPerMnt))}{" "}
              MNTでかう？
            </h2>
            <p className="mt-2 text-base font-bold text-[#7a5232]">
              {formatYen(confirmShop.priceJpy)}円 / 1 MNTのねだん {formatYen(festival.exchangeRateJpyPerMnt)}円
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="touch-button cancel-button" type="button" onClick={() => setConfirmShopId(null)}>
                やめる
              </button>
              <button
                className="touch-button buy-button"
                type="button"
                disabled={
                  currentCustomer.balanceMnt <
                  calculateMntPrice(confirmShop.priceJpy, festival.exchangeRateJpyPerMnt)
                }
                onClick={() => completePurchase(confirmShop)}
              >
                {confirmShop.actionLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function HomeScreen({
  festivalName,
  onNavigate,
}: {
  festivalName: string;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <section className="flex flex-1 flex-col px-5 py-8">
      <div className="mb-8">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9a3f2c]">Mantleなつまつり</p>
        <h1 className="mt-2 text-4xl font-black leading-tight text-[#25130a] sm:text-6xl">{festivalName}</h1>
      </div>

      <div className="grid flex-1 content-center gap-4 sm:grid-cols-2">
        <button className="role-button bg-[#ffdf63]" type="button" onClick={() => onNavigate("customer")}>
          <span className="text-7xl">👧</span>
          <span>おきゃくさん</span>
        </button>
        <button className="role-button bg-[#7bd7c6]" type="button" onClick={() => onNavigate("merchant")}>
          <span className="text-7xl">🏪</span>
          <span>おみせ</span>
        </button>
      </div>
    </section>
  );
}

function CustomerScreen({
  customer,
  exchangeRateJpyPerMnt,
  paymentMode,
  shops,
  successItemName,
  statusMessage,
  onPickShop,
  onCloseSuccess,
}: {
  customer: Customer;
  exchangeRateJpyPerMnt: number;
  paymentMode: PaymentMode;
  shops: Shop[];
  successItemName: string | null;
  statusMessage: string;
  onPickShop: (shopId: string) => void;
  onCloseSuccess: () => void;
}) {
  return (
    <section className="flex-1 px-4 py-5">
      <div className="mb-4 rounded-[24px] bg-white p-4 text-center shadow-sm">
        <p className="text-lg font-black text-[#8a3b1e]">げんざいの 1 MNT のねだん</p>
        <p className="mt-1 text-3xl font-black">1 MNT = {formatYen(exchangeRateJpyPerMnt)}円</p>
        <p className="mt-2 text-sm font-black text-[#7b4b21]">
          {paymentMode === "mantle-sepolia" ? "MNTのおさいふで はらう" : "れんしゅうモード"}
        </p>
      </div>

      <div className="rounded-[28px] bg-[#ffed9f] p-5 text-center shadow-sm">
        <p className="text-base font-black text-[#8a3b1e]">{customer.name}</p>
        <p className="text-xl font-black text-[#8a3b1e]">のこり</p>
        <p className="mt-1 text-6xl font-black leading-none">{formatMnt(customer.balanceMnt)} MNT</p>
      </div>

      {statusMessage ? (
        <p className="mt-3 rounded-[18px] bg-white px-4 py-3 text-center text-base font-black text-[#7b4b21]">
          {statusMessage}
        </p>
      ) : null}

      {successItemName ? (
        <section className="mt-4 rounded-[28px] bg-[#d8f8c7] p-5 text-center shadow-sm">
          <p className="text-5xl">🎉</p>
          <h2 className="mt-2 text-3xl font-black">かえたよ！</h2>
          <p className="mt-2 text-xl font-bold">{successItemName}を おみせでもらってね！</p>
          <button className="touch-button mt-4 bg-white" type="button" onClick={onCloseSuccess}>
            OK
          </button>
        </section>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {shops.map((shop) => {
          const priceMnt = calculateMntPrice(shop.priceJpy, exchangeRateJpyPerMnt);
          const canBuy = customer.balanceMnt >= priceMnt;

          return (
            <article key={shop.id} className="rounded-[28px] border-4 border-white bg-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="grid size-20 place-items-center rounded-[24px] bg-[#fff0c2] text-5xl">{shop.emoji}</div>
                <div>
                  <h2 className="text-3xl font-black">{shop.name}</h2>
                  <p className="text-xl font-bold text-[#755032]">{shop.description}</p>
                </div>
              </div>
              <p className="mt-4 text-center text-lg font-black text-[#755032]">{formatYen(shop.priceJpy)}円</p>
              <p className="mt-1 text-center text-5xl font-black text-[#c33d2d]">{formatMnt(priceMnt)} MNT</p>
              <button
                className="touch-button buy-button mt-4 w-full text-3xl"
                type="button"
                disabled={!canBuy}
                onClick={() => onPickShop(shop.id)}
              >
                {canBuy ? shop.actionLabel : "たりない"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MerchantScreen({
  selectedShopId,
  selectedStats,
  shopStats,
  total,
  exchangeRateJpyPerMnt,
  paymentMode,
  onSelectShop,
}: {
  selectedShopId: string;
  selectedStats?: {
    shop: Shop;
    records: ShopStats["records"];
    sales: number;
    count: number;
  };
  shopStats: {
    shop: Shop;
    records: ShopStats["records"];
    sales: number;
    count: number;
  }[];
  total: number;
  exchangeRateJpyPerMnt: number;
  paymentMode: PaymentMode;
  onSelectShop: (shopId: string) => void;
}) {
  if (!selectedStats) {
    return null;
  }

  return (
    <section className="flex-1 bg-[#17201d] px-4 py-5 text-white">
      <div className="rounded-lg border border-white/10 bg-[#22312c] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#99dac7]">Festival Total</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <p className="text-4xl font-black">{formatMnt(total)} MNT</p>
          <p className="pb-1 text-sm font-bold text-white/70">
            {paymentMode === "mantle-sepolia" ? "Mantle Sepolia / On-chain" : "Mantle Sepolia / Demo"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {shopStats.map(({ shop }) => (
          <button
            key={shop.id}
            className={`shrink-0 rounded-md px-4 py-3 text-left text-sm font-black ${
              selectedShopId === shop.id ? "bg-[#f8d45d] text-[#23190b]" : "bg-white/10 text-white"
            }`}
            type="button"
            onClick={() => onSelectShop(shop.id)}
          >
            <span className="mr-2 text-lg">{shop.emoji}</span>
            {shop.name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="STORE" value={`${selectedStats.shop.emoji} ${selectedStats.shop.name}`} />
        <Metric label="TODAY SALES" value={`${formatMnt(selectedStats.sales)} MNT`} />
        <Metric label="COUNT" value={`${selectedStats.count} 件`} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Metric label="NETWORK" value={paymentMode === "mantle-sepolia" ? "Mantle Sepolia / On-chain" : "Mantle Sepolia / Demo"} />
        <Metric label="1 MNTのねだん" value={`${formatYen(exchangeRateJpyPerMnt)}円`} />
      </div>

      <section className="mt-5 rounded-lg border border-white/10 bg-[#101715]">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#99dac7]">Recent Payments</h2>
        </div>
        <div className="divide-y divide-white/10">
          {selectedStats.records.length > 0 ? (
            selectedStats.records.slice(0, 12).map((record) => (
              <div key={record.id} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 px-4 py-4">
                <p className="font-mono text-sm text-white/70">{formatTime(record.createdAt)}</p>
                <div>
                  <p className="font-bold">{record.itemName} ×{record.quantity}</p>
                  <p className="text-xs font-bold text-[#99dac7]">
                    {formatYen(record.priceJpy)}円 / 1 MNTのねだん {formatYen(record.exchangeRateJpyPerMnt)}円
                  </p>
                  {record.transactionHash ? (
                    <a
                      className="mt-1 inline-block text-xs font-black text-[#f8d45d] underline"
                      href={`https://explorer.sepolia.mantle.xyz/tx/${record.transactionHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tx {shortHash(record.transactionHash)}
                    </a>
                  ) : null}
                </div>
                <p className="font-mono text-lg font-black text-[#f8d45d]">+{formatMnt(record.priceMnt)} MNT</p>
              </div>
            ))
          ) : (
            <p className="px-4 py-10 text-center text-sm font-bold text-white/55">まだ決済はありません</p>
          )}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/8 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">{label}</p>
      <p className="mt-2 break-words text-2xl font-black">{value}</p>
    </div>
  );
}

function SettingsScreen({
  festival,
  statusMessage,
  onFestivalNameChange,
  onExchangeRateChange,
  onPaymentModeChange,
  onShopChange,
  onAddShop,
  onDeleteShop,
  onResetDemo,
}: {
  festival: FestivalState;
  statusMessage: string;
  onFestivalNameChange: (name: string) => void;
  onExchangeRateChange: (exchangeRateJpyPerMnt: number) => void;
  onPaymentModeChange: (paymentMode: PaymentMode) => void;
  onShopChange: (shopId: string, nextShop: Partial<Shop>) => void;
  onAddShop: () => void;
  onDeleteShop: (shopId: string) => void;
  onResetDemo: () => void;
}) {
  function handleExchangeRate(event: FormEvent<HTMLInputElement>) {
    const value = Number(event.currentTarget.value);
    onExchangeRateChange(Number.isFinite(value) ? Math.max(1, value) : festival.exchangeRateJpyPerMnt);
  }

  function handlePrice(event: FormEvent<HTMLInputElement>, shop: Shop) {
    const value = Number(event.currentTarget.value);
    onShopChange(shop.id, { priceJpy: Number.isFinite(value) ? Math.max(0, value) : shop.priceJpy });
  }

  return (
    <section className="flex-1 px-4 py-5">
      {statusMessage ? (
        <p className="mb-4 rounded-lg bg-[#fff0c2] px-4 py-3 text-center text-sm font-black text-[#7b4b21]">
          {statusMessage}
        </p>
      ) : null}

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <label className="field-label" htmlFor="festival-name">
          おまつりの名前
        </label>
        <input
          id="festival-name"
          className="text-field mt-2"
          value={festival.festivalName}
          onChange={(event) => onFestivalNameChange(event.target.value)}
        />
      </div>

      <div className="mt-4 rounded-lg bg-white p-4 shadow-sm">
        <label className="field-label" htmlFor="exchange-rate">
          1 MNTのねだん
        </label>
        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
          <input
            id="exchange-rate"
            className="text-field"
            min="1"
            step="1"
            type="number"
            value={festival.exchangeRateJpyPerMnt}
            onInput={handleExchangeRate}
          />
          <p className="text-lg font-black">円</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[100, 150, 200].map((rate) => (
            <button
              key={rate}
              className="touch-button small-button bg-[#ffdf63]"
              type="button"
              onClick={() => onExchangeRateChange(rate)}
            >
              {rate}円
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-white p-4 shadow-sm">
        <p className="field-label">支払いモード</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className={`touch-button small-button ${
              festival.paymentMode === "demo" ? "bg-[#ffdf63]" : "bg-[#f7efe2]"
            }`}
            type="button"
            onClick={() => onPaymentModeChange("demo")}
          >
            れんしゅう
          </button>
          <button
            className={`touch-button small-button ${
              festival.paymentMode === "mantle-sepolia" ? "bg-[#7bd7c6]" : "bg-[#f7efe2]"
            }`}
            type="button"
            onClick={() => onPaymentModeChange("mantle-sepolia")}
          >
            test MNT
          </button>
        </div>
        <p className="mt-3 text-sm font-bold leading-6 text-[#6b4b2f]">
          test MNTでは、お客さん端末のウォレットから Mantle Sepolia で送ります。うまくいかない時は、れんしゅうに戻せます。
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black">お店</h2>
        <button className="touch-button small-button bg-[#ffdf63]" type="button" onClick={onAddShop}>
          ＋ お店を追加
        </button>
      </div>

      <div className="mt-3 grid gap-4">
        {festival.shops.map((shop) => (
          <article key={shop.id} className="rounded-lg bg-white p-4 shadow-sm">
            <div className="grid grid-cols-[4.5rem_1fr] gap-3">
              <div>
                <label className="field-label" htmlFor={`${shop.id}-emoji`}>
                  絵文字
                </label>
                <input
                  id={`${shop.id}-emoji`}
                  className="text-field mt-2 text-center text-3xl"
                  maxLength={4}
                  value={shop.emoji}
                  onChange={(event) => onShopChange(shop.id, { emoji: event.target.value })}
                />
              </div>
              <div>
                <label className="field-label" htmlFor={`${shop.id}-name`}>
                  お店の名前
                </label>
                <input
                  id={`${shop.id}-name`}
                  className="text-field mt-2"
                  value={shop.name}
                  onChange={(event) => onShopChange(shop.id, { name: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor={`${shop.id}-description`}>
                  商品説明
                </label>
                <input
                  id={`${shop.id}-description`}
                  className="text-field mt-2"
                  value={shop.description}
                  onChange={(event) => onShopChange(shop.id, { description: event.target.value })}
                />
              </div>
              <div>
                <label className="field-label" htmlFor={`${shop.id}-price`}>
                  円価格
                </label>
                <input
                  id={`${shop.id}-price`}
                  className="text-field mt-2"
                  min="0"
                  step="10"
                  type="number"
                  value={shop.priceJpy}
                  onInput={(event) => handlePrice(event, shop)}
                />
                <p className="mt-2 text-sm font-black text-[#7b4b21]">
                  今は {formatMnt(calculateMntPrice(shop.priceJpy, festival.exchangeRateJpyPerMnt))} MNT
                </p>
              </div>
              <div>
                <label className="field-label" htmlFor={`${shop.id}-action`}>
                  ボタン文字
                </label>
                <input
                  id={`${shop.id}-action`}
                  className="text-field mt-2"
                  value={shop.actionLabel}
                  onChange={(event) => onShopChange(shop.id, { actionLabel: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="field-label" htmlFor={`${shop.id}-recipient`}>
                test MNTの受け取り先
              </label>
              <input
                id={`${shop.id}-recipient`}
                className="text-field mt-2 font-mono text-sm"
                placeholder="0x..."
                value={shop.recipientAddress || ""}
                onChange={(event) => onShopChange(shop.id, { recipientAddress: event.target.value.trim() })}
              />
              {festival.paymentMode === "mantle-sepolia" && !isAddressLike(shop.recipientAddress) ? (
                <p className="mt-2 text-sm font-black text-[#b62e22]">test MNTで使うには受け取り先が必要です</p>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                className="rounded-md border border-[#d84630] px-4 py-3 text-sm font-black text-[#b62e22] disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                disabled={festival.shops.length <= 1}
                onClick={() => onDeleteShop(shop.id)}
              >
                削除
              </button>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-5 rounded-lg border border-[#ead7aa] bg-[#fff0c2] p-4">
        <h2 className="text-lg font-black">STEP 2 の準備</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-[#6b4b2f]">
          いまは Mantle Sepolia / Demo です。秘密鍵やシードフレーズは保存しません。
          次の実決済では recipientAddress をお店ごとに追加し、transactionHash / blockNumber / gasUsed を決済履歴へ保存できる形です。
        </p>
        <button className="touch-button cancel-button mt-4" type="button" onClick={onResetDemo}>
          残高と履歴をリセット
        </button>
      </section>
    </section>
  );
}
