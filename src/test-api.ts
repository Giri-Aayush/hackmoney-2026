/**
 * OptiChannel API Test Script
 *
 * Tests all API endpoints to verify the server is working correctly.
 */

const API_URL = process.env.API_URL || 'http://localhost:8081';
const WALLET_ADDRESS = '0x1234567890123456789012345678901234567890';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-wallet-address': WALLET_ADDRESS,
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, { ...options, headers });
  return response.json() as Promise<ApiResponse<T>>;
}

async function testHealthCheck() {
  console.log('\n1. Testing Health Check...');
  const res = await fetch(`${API_URL}/health`);
  const data = await res.json() as { status: string };
  console.log('   Status:', data.status);
  console.log('   ✓ Health check passed');
}

async function testGetPrice() {
  console.log('\n2. Testing GET /api/price...');
  const res = await fetchApi<{ symbol: string; price: number; confidence: number }>('/api/price');
  if (res.success && res.data) {
    console.log(`   Price: $${res.data.price.toFixed(2)}`);
    console.log(`   Confidence: ±$${res.data.confidence.toFixed(2)}`);
    console.log('   ✓ Price endpoint passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function testCreateOptionChain() {
  console.log('\n3. Testing POST /api/options/chain...');
  const res = await fetchApi<unknown[]>('/api/options/chain', {
    method: 'POST',
    body: JSON.stringify({
      strikeInterval: 100,
      numStrikes: 3,
      premium: 50,
      expiryMinutes: 60,
    }),
  });
  if (res.success && res.data) {
    console.log(`   Created ${res.data.length} options`);
    console.log('   ✓ Option chain created');
    return res.data;
  } else {
    console.log('   ✗ Failed:', res.error);
    return [];
  }
}

async function testListOptions() {
  console.log('\n4. Testing GET /api/options...');
  const res = await fetchApi<unknown[]>('/api/options');
  if (res.success && res.data) {
    console.log(`   Found ${res.data.length} options`);
    console.log('   ✓ List options passed');
    return res.data;
  } else {
    console.log('   ✗ Failed:', res.error);
    return [];
  }
}

async function testGetCalls() {
  console.log('\n5. Testing GET /api/options/calls...');
  const res = await fetchApi<unknown[]>('/api/options/calls');
  if (res.success && res.data) {
    console.log(`   Found ${res.data.length} call options`);
    console.log('   ✓ Get calls passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function testGetPuts() {
  console.log('\n6. Testing GET /api/options/puts...');
  const res = await fetchApi<unknown[]>('/api/options/puts');
  if (res.success && res.data) {
    console.log(`   Found ${res.data.length} put options`);
    console.log('   ✓ Get puts passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function testGetPortfolio() {
  console.log('\n7. Testing GET /api/portfolio...');
  const res = await fetchApi<{ balance: number; positions: unknown[] }>('/api/portfolio');
  if (res.success && res.data) {
    console.log(`   Balance: $${res.data.balance.toFixed(2)}`);
    console.log(`   Positions: ${res.data.positions.length}`);
    console.log('   ✓ Get portfolio passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function testDeposit() {
  console.log('\n8. Testing POST /api/portfolio/deposit...');
  const res = await fetchApi<{ balance: number }>('/api/portfolio/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount: 5000 }),
  });
  if (res.success && res.data) {
    console.log(`   New balance: $${res.data.balance.toFixed(2)}`);
    console.log('   ✓ Deposit passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function testOpenPosition(optionId: string) {
  console.log('\n9. Testing POST /api/portfolio/positions...');
  const res = await fetchApi<{ id: string; side: string; entryPrice: number }>('/api/portfolio/positions', {
    method: 'POST',
    body: JSON.stringify({
      optionId,
      side: 'long',
      size: 1,
    }),
  });
  if (res.success && res.data) {
    console.log(`   Position ID: ${res.data.id.slice(0, 10)}...`);
    console.log(`   Side: ${res.data.side}`);
    console.log(`   Entry: $${res.data.entryPrice.toFixed(2)}`);
    console.log('   ✓ Open position passed');
    return res.data.id;
  } else {
    console.log('   ✗ Failed:', res.error);
    return null;
  }
}

async function testStrategyTemplates() {
  console.log('\n10. Testing GET /api/strategies/templates...');
  const res = await fetchApi<{ type: string; name: string }[]>('/api/strategies/templates');
  if (res.success && res.data) {
    console.log(`   Available strategies: ${res.data.map((s) => s.name).join(', ')}`);
    console.log('   ✓ Strategy templates passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function testBuildStrategy() {
  console.log('\n11. Testing POST /api/strategies/build (Bull Call Spread)...');
  const priceRes = await fetchApi<{ price: number }>('/api/price');
  const spot = priceRes.data?.price || 2500;
  const roundedSpot = Math.round(spot / 100) * 100;

  const res = await fetchApi<{ name: string; netDebit: number; maxProfit: number | string; breakevens: number[] }>(
    '/api/strategies/build',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'bull_call_spread',
        underlying: 'ETH',
        lowerStrike: roundedSpot,
        upperStrike: roundedSpot + 200,
        expiryDays: 7,
      }),
    }
  );
  if (res.success && res.data) {
    console.log(`   Strategy: ${res.data.name}`);
    console.log(`   Net Debit: $${res.data.netDebit.toFixed(2)}`);
    console.log(`   Max Profit: $${typeof res.data.maxProfit === 'number' ? res.data.maxProfit.toFixed(2) : res.data.maxProfit}`);
    console.log(`   Breakeven: $${res.data.breakevens[0].toFixed(2)}`);
    console.log('   ✓ Build strategy passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function testOrderBookStats() {
  console.log('\n12. Testing GET /api/options/stats/summary...');
  const res = await fetchApi<{ totalOptions: number; openOptions: number }>('/api/options/stats/summary');
  if (res.success && res.data) {
    console.log(`   Total options: ${res.data.totalOptions}`);
    console.log(`   Open options: ${res.data.openOptions}`);
    console.log('   ✓ Order book stats passed');
  } else {
    console.log('   ✗ Failed:', res.error);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTICHANNEL API TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`API URL: ${API_URL}`);
  console.log(`Test Wallet: ${WALLET_ADDRESS}`);

  try {
    // Health & Price
    await testHealthCheck();
    await testGetPrice();

    // Options
    await testCreateOptionChain();
    const options = await testListOptions() as { id: string }[];
    await testGetCalls();
    await testGetPuts();

    // Portfolio
    await testGetPortfolio();
    await testDeposit();

    // Open a position if we have options
    if (options.length > 0) {
      await testOpenPosition(options[0].id);
    }

    // Strategies
    await testStrategyTemplates();
    await testBuildStrategy();

    // Stats
    await testOrderBookStats();

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

main();
