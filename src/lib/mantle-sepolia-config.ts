export const MANTLE_SEPOLIA_CHAIN_ID = "0x138b";
export const MANTLE_SEPOLIA_RPC_URL = "https://rpc.sepolia.mantle.xyz";
export const MANTLE_SEPOLIA_EXPLORER_URL = "https://explorer.sepolia.mantle.xyz";

export const mantleSepoliaAddChainParameter = {
  chainId: MANTLE_SEPOLIA_CHAIN_ID,
  chainName: "Mantle Sepolia",
  nativeCurrency: {
    name: "MNT",
    symbol: "MNT",
    decimals: 18,
  },
  rpcUrls: [MANTLE_SEPOLIA_RPC_URL],
  blockExplorerUrls: [MANTLE_SEPOLIA_EXPLORER_URL],
};
