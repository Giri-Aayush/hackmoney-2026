/**
 * Test script to verify Pyth oracle and Options engine.
 *
 * Run: npm run test:options
 */

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { Hex } from 'viem';
import { PythClient, PRICE_FEED_IDS } from './lib/pyth/index.js';
import { OptionsEngine, CreateOptionParams } from './lib/options/index.js';
import { config } from './config/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Optix - Options Engine Test');
  console.log('='.repeat(60));
  console.log();

  // Get wallet address
  const privateKey = config.wallet.privateKey as Hex;
  const account = privateKeyToAccount(privateKey);
  console.log(`Wallet: ${account.address}`);
  console.log();

  // Step 1: Test Pyth Oracle
  console.log('[1/4] Testing Pyth Oracle...');
  console.log('-'.repeat(40));

  const pythClient = new PythClient();

  try {
    const ethPrice = await pythClient.getEthUsdPrice();
    console.log(`ETH/USD Price: $${ethPrice.price.toFixed(2)}`);
    console.log(`Confidence: ±$${ethPrice.confidence.toFixed(2)}`);
    console.log(`Published: ${ethPrice.publishTime.toISOString()}`);
  } catch (error) {
    console.error('Failed to fetch ETH price:', error);
    process.exit(1);
  }

  console.log();

  // Step 2: Initialize Options Engine
  console.log('[2/4] Initializing Options Engine...');
  console.log('-'.repeat(40));

  const optionsEngine = new OptionsEngine(account.address, pythClient);
  console.log('Options engine initialized');
  console.log();

  // Step 3: Create a test option
  console.log('[3/4] Creating Test Options...');
  console.log('-'.repeat(40));

  // Get current price for setting strike
  const currentPrice = await pythClient.getEthUsdPrice();
  const strikeCall = Math.round(currentPrice.price * 1.05); // 5% OTM call
  const strikePut = Math.round(currentPrice.price * 0.95);  // 5% OTM put

  // Create a call option
  const callParams: CreateOptionParams = {
    underlying: 'ETH',
    strikePrice: strikeCall,
    premium: 50, // $50 premium
    expiryMinutes: 60, // 1 hour expiry
    optionType: 'call',
    amount: 0.1, // 0.1 ETH
  };

  const callOption = await optionsEngine.createOption(callParams);
  console.log();

  // Create a put option
  const putParams: CreateOptionParams = {
    underlying: 'ETH',
    strikePrice: strikePut,
    premium: 45, // $45 premium
    expiryMinutes: 60, // 1 hour expiry
    optionType: 'put',
    amount: 0.1, // 0.1 ETH
  };

  const putOption = await optionsEngine.createOption(putParams);
  console.log();

  // Step 4: Get option quotes
  console.log('[4/4] Getting Option Quotes...');
  console.log('-'.repeat(40));

  const callQuote = await optionsEngine.getOptionQuote(callOption.id);
  console.log('CALL Option Quote:');
  console.log(`  Current ETH Price: $${callQuote.currentPrice.toFixed(2)}`);
  console.log(`  Strike Price: $${strikeCall}`);
  console.log(`  Intrinsic Value: $${callQuote.intrinsicValue.toFixed(2)}`);
  console.log(`  Breakeven: $${callQuote.breakeven.toFixed(2)}`);
  console.log(`  Max Loss: $${callQuote.maxLoss.toFixed(2)}`);
  console.log(`  Max Profit: ${callQuote.maxProfit}`);
  console.log();

  const putQuote = await optionsEngine.getOptionQuote(putOption.id);
  console.log('PUT Option Quote:');
  console.log(`  Current ETH Price: $${putQuote.currentPrice.toFixed(2)}`);
  console.log(`  Strike Price: $${strikePut}`);
  console.log(`  Intrinsic Value: $${putQuote.intrinsicValue.toFixed(2)}`);
  console.log(`  Breakeven: $${putQuote.breakeven.toFixed(2)}`);
  console.log(`  Max Loss: $${putQuote.maxLoss.toFixed(2)}`);
  console.log(`  Max Profit: $${typeof putQuote.maxProfit === 'number' ? putQuote.maxProfit.toFixed(2) : putQuote.maxProfit}`);
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('OPTIONS SUMMARY');
  console.log('='.repeat(60));

  const allOptions = optionsEngine.getAllOptions();
  console.log(`Total Options Created: ${allOptions.length}`);

  for (const opt of allOptions) {
    const typeEmoji = opt.optionType === 'call' ? '📈' : '📉';
    console.log(`  ${typeEmoji} ${opt.optionType.toUpperCase()} | Strike: $${Number(opt.strikePrice) / 1e8} | Premium: $${Number(opt.premium) / 1e8} | Status: ${opt.status}`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('SUCCESS! Options engine is working.');
  console.log('='.repeat(60));
}

main().catch(console.error);
