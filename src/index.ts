// Optix - Gasless Options Trading Protocol
// Built on Yellow Network State Channels

// Core infrastructure
export * from './lib/yellow/index.js';
export * from './config/index.js';

// Price feeds
export { PythClient, PRICE_FEED_IDS } from './lib/pyth/index.js';
export type { PriceData } from './lib/pyth/index.js';

// Options engine
export { OptionsEngine, OptionsOrderBook } from './lib/options/index.js';
export type {
  Option,
  OptionType,
  OptionStatus,
  CreateOptionParams,
  OptionQuote,
  ListedOption,
  OrderBookStats,
} from './lib/options/index.js';

// Optix services
export { OptixService, OptixMarketplace } from './lib/optichannel/index.js';
export type { OptixConfig, ActiveSession, MarketplaceConfig, Trade } from './lib/optichannel/index.js';

// Pricing & Greeks
export {
  blackScholes,
  impliedVolatility,
  historicalVolatility,
  probabilityOfProfit,
} from './lib/pricing/index.js';
export type { BlackScholesInput, BlackScholesResult, Greeks } from './lib/pricing/index.js';

// Portfolio management
export { PositionManager } from './lib/portfolio/index.js';
export type { Position, PositionSide, PositionWithGreeks, PortfolioSummary } from './lib/portfolio/index.js';

// Strategy builder
export { StrategyBuilder } from './lib/strategies/index.js';
export type {
  StrategyType,
  StrategyLeg,
  Strategy,
  StrategyPnL,
  PayoffPoint,
  StrategyPayoff,
} from './lib/strategies/index.js';

// API server
export { OptixServer, server, state } from './api/index.js';
export type { ServerConfig } from './api/index.js';

// Version info
export const VERSION = '0.1.0';
export const PROTOCOL_NAME = 'Optix';
