/**
 * Test script for full Optix trading flow.
 *
 * Run: npm run test:trading
 */

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { Hex, Address } from 'viem';
import { YellowClient } from './lib/yellow/index.js';
import { PythClient } from './lib/pyth/index.js';
import { OptixService } from './lib/optichannel/index.js';
import { config } from './config/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Optix - Full Trading Flow Test');
  console.log('='.repeat(60));
  console.log();

  const privateKey = config.wallet.privateKey as Hex;
  const account = privateKeyToAccount(privateKey);

  console.log('[1/5] Connecting to Yellow Network...');
  console.log('-'.repeat(40));

  const yellowClient = new YellowClient({
    clearNodeUrl: config.yellow.clearNodeUrl,
    privateKey,
    address: account.address,
    application: 'clearnode',
  });

  await yellowClient.connectAndAuthenticate();
  console.log('Connected and authenticated!\n');

  console.log('[2/5] Initializing Optix Service...');
  console.log('-'.repeat(40));

  const pythClient = new PythClient();
  const optix = new OptixService({
    yellowClient,
    pythClient,
  });

  console.log(`Service address: ${optix.address}`);
  console.log();

  console.log('[3/5] Fetching Current Market Price...');
  console.log('-'.repeat(40));

  const ethPrice = await optix.getCurrentEthPrice();
  console.log(`ETH/USD: $${ethPrice.toFixed(2)}`);
  console.log();

  console.log('[4/5] Running Full Trade Simulation...');
  console.log('-'.repeat(40));

  const mockCounterparty = '0x1234567890123456789012345678901234567890' as Address;

  const { option, session, quote } = await optix.simulateFullTrade(mockCounterparty);

  console.log('[5/5] Trade Summary...');
  console.log('-'.repeat(40));

  console.log('\nOption Details:');
  console.log(`  ID: ${option.id.slice(0, 20)}...`);
  console.log(`  Type: ${option.optionType.toUpperCase()}`);
  console.log(`  Underlying: ${option.underlying}`);
  console.log(`  Amount: ${Number(option.amount) / 1e18} ${option.underlying}`);
  console.log(`  Strike: $${Number(option.strikePrice) / 1e8}`);
  console.log(`  Premium: $${Number(option.premium) / 1e8}`);
  console.log(`  Expiry: ${new Date(option.expiry * 1000).toISOString()}`);
  console.log(`  Status: ${option.status}`);

  console.log('\nSession Details:');
  console.log(`  Session ID: ${session.sessionId.slice(0, 20)}...`);
  console.log(`  Writer: ${option.writer}`);
  console.log(`  Counterparty: ${session.counterparty}`);

  console.log('\nQuote Analysis:');
  console.log(`  Current Price: $${quote.currentPrice.toFixed(2)}`);
  console.log(`  Intrinsic Value: $${quote.intrinsicValue.toFixed(2)}`);
  console.log(`  Breakeven: $${quote.breakeven.toFixed(2)}`);
  console.log(`  Max Loss: $${quote.maxLoss.toFixed(2)}`);
  console.log(`  Max Profit: ${quote.maxProfit === 'unlimited' ? 'Unlimited' : `$${quote.maxProfit.toFixed(2)}`}`);

  console.log('\n' + '='.repeat(60));
  console.log('Active Sessions:', optix.getAllActiveSessions().length);
  console.log('Total Options:', optix.getAllOptions().length);
  console.log('='.repeat(60));

  console.log('\nCleaning up...');
  await optix.closeSession(session.sessionId);
  await yellowClient.disconnect();

  console.log('\n' + '='.repeat(60));
  console.log('SUCCESS! Full trading flow completed.');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
