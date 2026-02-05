import 'dotenv/config';

export const config = {
  // Yellow Network
  yellow: {
    // Using production URL - sandbox may have limitations
    clearNodeUrl: process.env.YELLOW_CLEARNODE_URL || 'wss://clearnet.yellow.com/ws',
    appId: process.env.YELLOW_APP_ID || '',
  },

  // Blockchain (Ethereum Sepolia)
  chain: {
    rpcUrl: process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    chainId: parseInt(process.env.CHAIN_ID || '11155111', 10),
  },

  // Pyth Oracle (Ethereum Sepolia)
  pyth: {
    hermesUrl: process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network',
    contractAddress: process.env.PYTH_CONTRACT_ADDRESS || '0xDd24F84d36BF92C65F92307595335bdFab5Bbd21',
    ethUsdPriceId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  },

  // Wallet (only for development/testing)
  wallet: {
    privateKey: process.env.PRIVATE_KEY || '',
  },

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },

  // Environment
  isDev: process.env.NODE_ENV !== 'production',
} as const;

export type Config = typeof config;
