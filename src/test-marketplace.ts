/**
 * Test script for OptiChannel marketplace (order book model).
 *
 * Run: npm run test:marketplace
 */

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { Hex, Address } from 'viem';
import { YellowClient } from './lib/yellow/index.js';
import { PythClient } from './lib/pyth/index.js';
import { OptiChannelMarketplace } from './lib/optichannel/index.js';
import { config } from './config/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('OptiChannel - Marketplace Test');
  console.log('='.repeat(60));
  console.log();

  const privateKey = config.wallet.privateKey as Hex;
  const account = privateKeyToAccount(privateKey);

  console.log('[1/6] Connecting to Yellow Network...');
  console.log('-'.repeat(40));

  const yellowClient = new YellowClient({
    clearNodeUrl: config.yellow.clearNodeUrl,
    privateKey,
    address: account.address,
    application: 'clearnode',
  });

  await yellowClient.connectAndAuthenticate();
  console.log('Connected!\n');

  console.log('[2/6] Initializing Marketplace...');
  console.log('-'.repeat(40));

  const pythClient = new PythClient();
  const marketplace = new OptiChannelMarketplace({
    yellowClient,
    pythClient,
  });

  const ethPrice = await marketplace.getCurrentPrice();
  console.log(`Current ETH/USD: $${ethPrice.toFixed(2)}\n`);

  console.log('[3/6] Creating Option Chain...');
  console.log('-'.repeat(40));

  const baseStrike = Math.round(ethPrice / 100) * 100;
  await marketplace.createOptionChain({
    underlying: 'ETH',
    baseStrike,
    strikeInterval: 50,
    numStrikes: 5,
    premium: 20,
    expiryMinutes: 60,
  });

  console.log();

  console.log('[4/6] Browsing Available Options...');
  console.log('-'.repeat(40));

  const stats = marketplace.getOrderBookStats();
  console.log(`Order Book Stats:`);
  console.log(`  Total Listings: ${stats.totalListings}`);
  console.log(`  Active: ${stats.activeListings}`);
  console.log(`  Calls: ${stats.calls}`);
  console.log(`  Puts: ${stats.puts}`);
  console.log();

  const calls = marketplace.getCalls();
  const puts = marketplace.getPuts();

  console.log('Available CALL Options:');
  console.log('-'.repeat(40));
  for (const opt of calls.slice(0, 5)) {
    const strike = Number(opt.strikePrice) / 1e8;
    const premium = Number(opt.premium) / 1e8;
    console.log(`  Strike: $${strike} | Premium: $${premium} | ID: ${opt.id.slice(0, 10)}...`);
  }
  console.log();

  console.log('Available PUT Options:');
  console.log('-'.repeat(40));
  for (const opt of puts.slice(0, 5)) {
    const strike = Number(opt.strikePrice) / 1e8;
    const premium = Number(opt.premium) / 1e8;
    console.log(`  Strike: $${strike} | Premium: $${premium} | ID: ${opt.id.slice(0, 10)}...`);
  }
  console.log();

  console.log('[5/6] Simulating Buy Order...');
  console.log('-'.repeat(40));

  if (calls.length > 0) {
    const optionToBuy = calls[Math.floor(calls.length / 2)];
    console.log(`Buying CALL option at strike $${Number(optionToBuy.strikePrice) / 1e8}...`);

    const trade = await marketplace.buyOption(optionToBuy.id);
    console.log(`Trade ID: ${trade.tradeId.slice(0, 10)}...`);
    console.log(`Premium Paid: $${Number(trade.premium) / 1e8}`);
    console.log(`Seller: ${trade.seller.slice(0, 10)}...`);
  }
  console.log();

  console.log('[6/6] Final Summary...');
  console.log('-'.repeat(40));

  const finalStats = marketplace.getOrderBookStats();
  console.log(`Order Book Stats (after trade):`);
  console.log(`  Active Listings: ${finalStats.activeListings}`);
  console.log(`  Total Volume: ${finalStats.totalVolume} trades`);
  console.log();

  const myTrades = marketplace.getMyTrades();
  console.log(`My Trades: ${myTrades.length}`);

  const myWritten = marketplace.getMyWrittenOptions();
  console.log(`My Written Options: ${myWritten.length}`);

  const myPurchased = marketplace.getMyPurchasedOptions();
  console.log(`My Purchased Options: ${myPurchased.length}`);

  await yellowClient.disconnect();

  console.log('\n' + '='.repeat(60));
  console.log('SUCCESS! Marketplace test completed.');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
