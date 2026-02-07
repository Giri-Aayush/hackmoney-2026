/**
 * Test script to verify Yellow Network connection.
 *
 * Prerequisites:
 * 1. Copy .env.example to .env
 * 2. Add your private key to .env (use a TEST wallet!)
 *
 * Run: npm run test:connection
 */

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { Hex } from 'viem';
import { YellowClient } from './lib/yellow/index.js';
import { config } from './config/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Optix - Yellow Network Connection Test');
  console.log('='.repeat(60));
  console.log();

  // Check for private key
  if (!config.wallet.privateKey) {
    console.error('ERROR: No private key found!');
    console.error('Please copy .env.example to .env and add your PRIVATE_KEY');
    console.error('WARNING: Use a TEST wallet only!');
    process.exit(1);
  }

  try {
    // Step 1: Get address from private key
    console.log('[1/4] Creating wallet...');
    const privateKey = config.wallet.privateKey as Hex;
    const account = privateKeyToAccount(privateKey);
    console.log(`      Address: ${account.address}`);
    console.log();

    // Step 2: Initialize Yellow client
    console.log('[2/4] Initializing Yellow client...');
    const client = new YellowClient({
      clearNodeUrl: config.yellow.clearNodeUrl,
      privateKey,
      address: account.address,
      // Using "clearnode" for root access per Yellow Network docs
      application: 'clearnode',
      onStateChange: (state) => {
        console.log(`      Connection state: ${state}`);
      },
      onMessage: (method, data) => {
        console.log('      Broadcast message:', method);
      },
      onError: (error) => {
        console.error('      Error:', error.message);
      },
    });
    console.log(`      ClearNode URL: ${config.yellow.clearNodeUrl}`);
    console.log();

    // Step 3: Connect to ClearNode
    console.log('[3/4] Connecting to ClearNode...');
    await client.connect();
    console.log('      Connected!');
    console.log();

    // Step 4: Authenticate
    console.log('[4/4] Authenticating...');
    await client.authenticate();
    console.log('      Authenticated!');
    console.log();

    // Bonus: Get config and balances
    console.log('='.repeat(60));
    console.log('Fetching account info...');
    console.log('='.repeat(60));
    console.log();

    try {
      const configResponse = await client.getConfig();
      console.log('ClearNode Config:', JSON.stringify(configResponse.data, null, 2));
    } catch (error) {
      console.log('Config fetch skipped (may not be available in sandbox)');
    }

    console.log();

    try {
      const channels = await client.getChannels();
      console.log('Channels:', JSON.stringify(channels.data, null, 2));
    } catch (error) {
      console.log('Channels fetch skipped');
    }

    console.log();

    try {
      const balances = await client.getLedgerBalances();
      console.log('Ledger Balances:', JSON.stringify(balances.data, null, 2));
    } catch (error) {
      console.log('Balances fetch skipped (may require deposit first)');
    }

    console.log();
    console.log('='.repeat(60));
    console.log('SUCCESS! Yellow Network connection is working.');
    console.log('='.repeat(60));

    // Keep connection alive for a few seconds to demonstrate ping
    console.log();
    console.log('Keeping connection alive for 5 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Disconnect
    console.log('Disconnecting...');
    await client.disconnect();
    console.log('Disconnected!');

  } catch (error) {
    console.error();
    console.error('='.repeat(60));
    console.error('CONNECTION FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error();
    console.error('Troubleshooting:');
    console.error('1. Check your internet connection');
    console.error('2. Verify your private key is correct');
    console.error('3. Make sure you are using the sandbox endpoint for testing');
    console.error('4. The ClearNode may be temporarily unavailable');
    process.exit(1);
  }
}

main();
