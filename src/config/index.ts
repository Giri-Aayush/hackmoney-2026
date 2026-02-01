import 'dotenv/config';

export const config = {
  // Yellow Network
  yellow: {
    // Using production URL - sandbox may have limitations
    clearNodeUrl: process.env.YELLOW_CLEARNODE_URL || 'wss://clearnet.yellow.com/ws',
    appId: process.env.YELLOW_APP_ID || '',
  },

  // Blockchain
  chain: {
    rpcUrl: process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    chainId: parseInt(process.env.CHAIN_ID || '421614', 10),
  },

  // Pyth Oracle
  pyth: {
    hermesUrl: process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network',
    contractAddress: process.env.PYTH_CONTRACT_ADDRESS || '0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF',
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
