import { defineChain } from "viem";
import { MANTLE_SEPOLIA_EXPLORER_URL, MANTLE_SEPOLIA_RPC_URL, mantleSepoliaAddChainParameter } from "./mantle-sepolia-config";

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "MNT",
    symbol: "MNT",
  },
  rpcUrls: {
    default: {
      http: [MANTLE_SEPOLIA_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Mantle Sepolia Explorer",
      url: MANTLE_SEPOLIA_EXPLORER_URL,
    },
  },
  testnet: true,
});
export { mantleSepoliaAddChainParameter };
