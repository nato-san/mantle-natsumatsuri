export type Shop = {
  id: string;
  emoji: string;
  name: string;
  description: string;
  priceJpy: number;
  actionLabel: string;
  recipientAddress?: string;
};

export type Customer = {
  id: string;
  name: string;
  balanceMnt: number;
  createdAt: string;
};

export type PaymentRecord = {
  id: string;
  customerId: string;
  customerName: string;
  shopId: string;
  itemName: string;
  priceJpy: number;
  priceMnt: number;
  exchangeRateJpyPerMnt: number;
  quantity: number;
  createdAt: string;
  mode: "demo" | "mantle-sepolia";
  status: "recorded" | "pending" | "confirmed" | "failed";
  recipientAddress?: string;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
};

export type PaymentMode = "demo" | "mantle-sepolia";

export type FestivalState = {
  festivalName: string;
  exchangeRateJpyPerMnt: number;
  paymentMode: PaymentMode;
  shops: Shop[];
  customers: Customer[];
  payments: PaymentRecord[];
};

export type FestivalResponse = FestivalState & {
  currentCustomer: Customer;
};

export type ShopStats = {
  shop: Shop;
  records: PaymentRecord[];
  sales: number;
  count: number;
};
