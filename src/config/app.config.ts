export const APP_CONFIG = {
  appName: 'DID Wallet',
  defaults: {
    theme: 'system' as 'system' | 'light' | 'dark',
    lastActiveTab: 'tokens' as 'tokens' | 'vc' | 'nft' | 'activity',
    currentNetworkChainId: 1, // Ethereum mainnet by default
  },
} as const;


