

export const STARK_ETH_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

export const TOKENS: Record<string, string> = {
  ETH: STARK_ETH_ADDRESS,
  USDC: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
  DAI: '0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
  USDT: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
  WBTC: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
};

export const DECIMALS: Record<string, number> = {
  ETH: 18,
  USDC: 6,
  DAI: 18,
  USDT: 6,
  WBTC: 8,
};

// Argent X hashes:
export const AX_PROXY_CLASS_HASH = "0x25ec026985a3bf9d0cc1fe17326b245dfdc3ff89b8fde106542a3ea56c5a918";
export const AX_ACCOUNT_CLASS_HASH = "0x033434ad846cdd5f23eb73ff09fe6fddd568284a0fb7d1be20ee482f044dabe2";

export const BraavosProxyClassHash = '0x03131fa018d520a037686ce3efddeab8f28895662f019ca3ca18a626650f7d1e';
export const BraavosInitialClassHash = '0x5aa23d5bb71ddaa783da7ea79d405315bafa7cf0387a74f4593578c3e9e6570';

export const DMAIL_ROUTER_ADDRESS = '0x0454f0bd015e730e5adbb4f080b075fdbf55654ff41ee336203aa2e1ac4d4309';

export type Data = {
  address?: string;
  type?: 'Argent' | 'Braavos';
  transactions?: number;
  fees?: number;
}

export type StarkAccountData = {
  type: 'Argent' | 'Braavos';
  address: string;
}