/**
 * OptiChannel API Flow Test
 *
 * Run this WHILE the server is running to see logs in the server terminal.
 * This tests the complete API flow: price, options, trading
 */

import { privateKeyToAccount } from 'viem/accounts';
import { Hex } from 'viem';
import { config } from './config/index.js';

const API_URL = process.env.API_URL || 'http://localhost:8081';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any;

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTICHANNEL API FLOW TEST');
  console.log('  Testing against: ' + API_URL);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Get wallet addresses from private keys
  const writerKey = config.wallet.privateKey as Hex;
  if (!writerKey) {
    console.log('ERROR: No wallet configured');
    process.exit(1);
  }

  const writerAccount = privateKeyToAccount(writerKey);
  const writerAddress = writerAccount.address;

  // Use a different address as buyer (just for testing - in real scenario these would be different users)
  const buyerAddress = '0x1234567890123456789012345678901234567890';

  console.log(`Writer: ${writerAddress}`);
  console.log(`Buyer: ${buyerAddress}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: Health Check
  // ═══════════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: Health Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const res = await fetch(`${API_URL}/health`);
    const data: AnyJson = await res.json();
    console.log(`   Status: ${data.status}`);
    console.log(`   Version: ${data.version}`);
  } catch (error) {
    console.log(`   ✗ Server not running at ${API_URL}`);
    console.log('   Run: npm run dev');
    process.exit(1);
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2: Get Price from Pyth
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: Get ETH/USD Price from Pyth');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let currentPrice = 0;
  try {
    const res = await fetch(`${API_URL}/api/price`);
    const data: AnyJson = await res.json();
    if (data.success) {
      currentPrice = data.data.price;
      console.log(`   ✓ ETH/USD: $${currentPrice.toFixed(2)}`);
      console.log(`   ✓ Confidence: ±$${data.data.confidence.toFixed(2)}`);
    } else {
      console.log(`   ✗ Error: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 3: Create a CALL Option
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 3: Create CALL Option');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const strikePrice = Math.round(currentPrice / 100) * 100 + 100; // Round to nearest 100 + 100
  let callOptionId = '';

  try {
    const res = await fetch(`${API_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': writerAddress,
      },
      body: JSON.stringify({
        underlying: 'ETH',
        strikePrice,
        premium: 50,
        expiryMinutes: 60,
        optionType: 'call',
        amount: 0.1,
      }),
    });
    const data: AnyJson = await res.json();
    if (data.success) {
      callOptionId = data.data.id;
      console.log(`   ✓ Created CALL option`);
      console.log(`   ✓ ID: ${callOptionId.slice(0, 20)}...`);
      console.log(`   ✓ Strike: $${data.data.strikePrice}`);
      console.log(`   ✓ Premium: $${data.data.premium}`);
      console.log(`   ✓ Expiry: ${data.data.expiryDate}`);
    } else {
      console.log(`   ✗ Error: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 4: Create a PUT Option
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 4: Create PUT Option');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const putStrike = Math.round(currentPrice / 100) * 100 - 100; // Round to nearest 100 - 100
  let putOptionId = '';

  try {
    const res = await fetch(`${API_URL}/api/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': writerAddress,
      },
      body: JSON.stringify({
        underlying: 'ETH',
        strikePrice: putStrike,
        premium: 45,
        expiryMinutes: 60,
        optionType: 'put',
        amount: 0.1,
      }),
    });
    const data: AnyJson = await res.json();
    if (data.success) {
      putOptionId = data.data.id;
      console.log(`   ✓ Created PUT option`);
      console.log(`   ✓ ID: ${putOptionId.slice(0, 20)}...`);
      console.log(`   ✓ Strike: $${data.data.strikePrice}`);
      console.log(`   ✓ Premium: $${data.data.premium}`);
    } else {
      console.log(`   ✗ Error: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 5: List All Options
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 5: List All Available Options');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const res = await fetch(`${API_URL}/api/options`);
    const data: AnyJson = await res.json();
    if (data.success) {
      console.log(`   ✓ Found ${data.data.length} options`);
      for (const opt of data.data) {
        console.log(`     - ${opt.optionType.toUpperCase()} $${opt.strikePrice} | Premium: $${opt.premium}`);
      }
    } else {
      console.log(`   ✗ Error: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 6: Buy the CALL Option
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 6: Buy CALL Option');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (callOptionId) {
    try {
      const res = await fetch(`${API_URL}/api/options/${callOptionId}/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': buyerAddress,
        },
      });
      const data: AnyJson = await res.json();
      if (data.success) {
        console.log(`   ✓ Bought CALL option!`);
        console.log(`   ✓ Holder: ${data.data.holder?.slice(0, 10)}...`);
        console.log(`   ✓ Premium paid: $${data.data.premium}`);
      } else {
        console.log(`   ✗ Error: ${data.error}`);
      }
    } catch (error) {
      console.log(`   ✗ Error: ${error}`);
    }
  } else {
    console.log('   ⚠ Skipped - no call option created');
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 7: Get Order Book Stats
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 7: Order Book Stats');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const res = await fetch(`${API_URL}/api/options/stats/summary`);
    const data: AnyJson = await res.json();
    if (data.success) {
      console.log(`   ✓ Total listings: ${data.data.totalListings}`);
      console.log(`   ✓ Active listings: ${data.data.activeListings}`);
      console.log(`   ✓ Total volume: ${data.data.totalVolume}`);
      console.log(`   ✓ Calls: ${data.data.calls}`);
      console.log(`   ✓ Puts: ${data.data.puts}`);
    } else {
      console.log(`   ✗ Error: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 8: Get Strategy Templates
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 8: Strategy Templates');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const res = await fetch(`${API_URL}/api/strategies/templates`);
    const data: AnyJson = await res.json();
    if (data.success) {
      console.log(`   ✓ Found ${data.data.length} strategy templates:`);
      for (const tmpl of data.data) {
        console.log(`     - ${tmpl.name}: ${tmpl.description.slice(0, 40)}...`);
      }
    } else {
      console.log(`   ✗ Error: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  await delay(500);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 9: Market Volume Stats
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 9: Market Volume & Open Interest');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const volumeRes = await fetch(`${API_URL}/api/market/volume`);
    const volumeData: AnyJson = await volumeRes.json();
    if (volumeData.success) {
      console.log(`   ✓ 24h Volume: ${volumeData.data.volume24h || 0}`);
      console.log(`   ✓ Trade Count: ${volumeData.data.tradeCount24h || 0}`);
    } else {
      console.log(`   ✗ Volume Error: ${volumeData.error}`);
    }

    const oiRes = await fetch(`${API_URL}/api/market/open-interest`);
    const oiData: AnyJson = await oiRes.json();
    if (oiData.success) {
      console.log(`   ✓ Total Open Interest: ${oiData.data.totals?.totalOI || 0}`);
      console.log(`   ✓ Put/Call Ratio: ${oiData.data.totals?.putCallRatio?.toFixed(2) || 'N/A'}`);
    } else {
      console.log(`   ✗ OI Error: ${oiData.error}`);
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  API FLOW TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log('Check your server terminal for detailed logs!\n');
  console.log('Endpoints tested:');
  console.log('  ✓ GET  /health');
  console.log('  ✓ GET  /api/price');
  console.log('  ✓ POST /api/options (create CALL)');
  console.log('  ✓ POST /api/options (create PUT)');
  console.log('  ✓ GET  /api/options (list all)');
  console.log('  ✓ POST /api/options/:id/buy');
  console.log('  ✓ GET  /api/options/stats/summary');
  console.log('  ✓ GET  /api/strategies/templates');
  console.log('  ✓ GET  /api/market/volume');
  console.log('  ✓ GET  /api/market/open-interest\n');
}

main().catch(console.error);
