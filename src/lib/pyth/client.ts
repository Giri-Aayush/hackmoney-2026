import { HermesClient } from '@pythnetwork/hermes-client';
import { config } from '../../config/index.js';

// Pyth Price Feed IDs (mainnet IDs work on testnet too)
export const PRICE_FEED_IDS = {
  ETH_USD: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  BTC_USD: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  USDC_USD: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
} as const;

export interface PriceData {
  price: number;
  confidence: number;
  expo: number;
  publishTime: Date;
  priceId: string;
}

export class PythClient {
  private client: HermesClient;

  constructor(hermesUrl?: string) {
    this.client = new HermesClient(hermesUrl || config.pyth.hermesUrl);
  }

  /**
   * Fetches the latest price for a given price feed ID.
   */
  async getLatestPrice(priceId: string): Promise<PriceData> {
    const response = await this.client.getLatestPriceUpdates([priceId], {
      parsed: true,
    });

    if (!response.parsed || response.parsed.length === 0) {
      throw new Error(`No price data found for ${priceId}`);
    }

    const feed = response.parsed[0];
    const priceInfo = feed.price;

    if (!priceInfo) {
      throw new Error(`Price info not available for ${priceId}`);
    }

    // Convert from Pyth format (price * 10^expo) to human-readable
    const price = Number(priceInfo.price) * Math.pow(10, priceInfo.expo);
    const confidence = Number(priceInfo.conf) * Math.pow(10, priceInfo.expo);

    return {
      price,
      confidence,
      expo: priceInfo.expo,
      publishTime: new Date(priceInfo.publish_time * 1000),
      priceId: feed.id,
    };
  }

  /**
   * Fetches the latest ETH/USD price.
   */
  async getEthUsdPrice(): Promise<PriceData> {
    return this.getLatestPrice(PRICE_FEED_IDS.ETH_USD);
  }

  /**
   * Fetches the latest BTC/USD price.
   */
  async getBtcUsdPrice(): Promise<PriceData> {
    return this.getLatestPrice(PRICE_FEED_IDS.BTC_USD);
  }

  /**
   * Fetches multiple prices at once.
   */
  async getMultiplePrices(priceIds: string[]): Promise<Map<string, PriceData>> {
    const response = await this.client.getLatestPriceUpdates(priceIds, {
      parsed: true,
    });

    const result = new Map<string, PriceData>();

    if (!response.parsed) {
      return result;
    }

    for (const feed of response.parsed) {
      const priceInfo = feed.price;
      if (priceInfo) {
        const price = Number(priceInfo.price) * Math.pow(10, priceInfo.expo);
        const confidence = Number(priceInfo.conf) * Math.pow(10, priceInfo.expo);

        result.set(feed.id, {
          price,
          confidence,
          expo: priceInfo.expo,
          publishTime: new Date(priceInfo.publish_time * 1000),
          priceId: feed.id,
        });
      }
    }

    return result;
  }
}
