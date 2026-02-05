import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { config } from './config/index.js';
import { DEFAULT_CONTRACTS } from './lib/settlement/service.js';

// Contract ABIs
const OPTICHANNEL_ABI = [
  { type: 'function', name: 'balances', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'withdrawalNonces', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'MIN_DEPOSIT', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'CHALLENGE_PERIOD', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'usdc', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'pyth', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'ethUsdPriceId', inputs: [], outputs: [{ type: 'bytes32' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  OPTICHANNEL ON-CHAIN TEST - ETHEREUM SEPOLIA');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Setup
  const rpcUrl = process.env.SEPOLIA_RPC_URL || config.chain.rpcUrl;
  console.log(`RPC URL: ${rpcUrl.substring(0, 50)}...`);
  console.log(`Contract: ${DEFAULT_CONTRACTS.optiChannel}`);
  console.log(`USDC: ${DEFAULT_CONTRACTS.usdc}`);
  console.log(`Pyth: ${DEFAULT_CONTRACTS.pyth}\n`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  // Get wallet if private key available
  let walletAddress: Address | null = null;
  if (config.wallet.privateKey) {
    const account = privateKeyToAccount(config.wallet.privateKey as `0x${string}`);
    walletAddress = account.address;
    console.log(`Wallet: ${walletAddress}\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: Contract Deployment Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check if contract exists
    const code = await publicClient.getCode({ address: DEFAULT_CONTRACTS.optiChannel });
    if (code && code !== '0x') {
      console.log('   ✓ Contract deployed and has bytecode');
      console.log(`   Bytecode size: ${(code.length - 2) / 2} bytes\n`);
    } else {
      console.log('   ✗ Contract not found at address\n');
      return;
    }

    // Read contract constants
    const minDeposit = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'MIN_DEPOSIT',
    });
    console.log(`   MIN_DEPOSIT: ${formatUnits(minDeposit as bigint, 6)} USDC`);

    const challengePeriod = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'CHALLENGE_PERIOD',
    });
    console.log(`   CHALLENGE_PERIOD: ${Number(challengePeriod) / 3600} hours`);

    const usdcAddr = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'usdc',
    });
    console.log(`   USDC address: ${usdcAddr}`);
    console.log(`   ✓ Matches expected: ${usdcAddr === DEFAULT_CONTRACTS.usdc}`);

    const pythAddr = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'pyth',
    });
    console.log(`   Pyth address: ${pythAddr}`);
    console.log(`   ✓ Matches expected: ${pythAddr === DEFAULT_CONTRACTS.pyth}`);

    const priceId = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.optiChannel,
      abi: OPTICHANNEL_ABI,
      functionName: 'ethUsdPriceId',
    });
    console.log(`   ETH/USD Price ID: ${priceId}`);

  } catch (error) {
    console.log(`   ✗ Error reading contract: ${error}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: USDC Token Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const usdcSymbol = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.usdc,
      abi: ERC20_ABI,
      functionName: 'symbol',
    });
    console.log(`   Token symbol: ${usdcSymbol}`);

    const usdcDecimals = await publicClient.readContract({
      address: DEFAULT_CONTRACTS.usdc,
      abi: ERC20_ABI,
      functionName: 'decimals',
    });
    console.log(`   Decimals: ${usdcDecimals}`);

    if (walletAddress) {
      const usdcBalance = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      });
      console.log(`   Wallet USDC balance: ${formatUnits(usdcBalance as bigint, 6)} USDC`);

      const allowance = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.usdc,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddress, DEFAULT_CONTRACTS.optiChannel],
      });
      console.log(`   Allowance to OptiChannel: ${formatUnits(allowance as bigint, 6)} USDC`);
    }
  } catch (error) {
    console.log(`   ✗ Error reading USDC: ${error}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 3: Wallet Balances');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (walletAddress) {
    try {
      // ETH balance
      const ethBalance = await publicClient.getBalance({ address: walletAddress });
      console.log(`   ETH balance: ${formatUnits(ethBalance, 18)} ETH`);

      // OptiChannel balance
      const optiBalance = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.optiChannel,
        abi: OPTICHANNEL_ABI,
        functionName: 'balances',
        args: [walletAddress],
      });
      console.log(`   OptiChannel balance: ${formatUnits(optiBalance as bigint, 6)} USDC`);

      // Nonce
      const nonce = await publicClient.readContract({
        address: DEFAULT_CONTRACTS.optiChannel,
        abi: OPTICHANNEL_ABI,
        functionName: 'withdrawalNonces',
        args: [walletAddress],
      });
      console.log(`   Withdrawal nonce: ${nonce}`);

    } catch (error) {
      console.log(`   ✗ Error reading balances: ${error}`);
    }
  } else {
    console.log('   ⚠ No wallet configured (set PRIVATE_KEY in .env)');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 4: Network Info');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`   Current block: ${blockNumber}`);

    const chainId = await publicClient.getChainId();
    console.log(`   Chain ID: ${chainId}`);
    console.log(`   ✓ Matches Sepolia: ${chainId === 11155111}`);

    const gasPrice = await publicClient.getGasPrice();
    console.log(`   Gas price: ${formatUnits(gasPrice, 9)} gwei`);

  } catch (error) {
    console.log(`   ✗ Error reading network: ${error}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  ON-CHAIN TESTS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Summary
  console.log('Contract Links:');
  console.log(`  OptiChannel: https://sepolia.etherscan.io/address/${DEFAULT_CONTRACTS.optiChannel}`);
  console.log(`  USDC: https://sepolia.etherscan.io/address/${DEFAULT_CONTRACTS.usdc}`);
  console.log(`  Pyth: https://sepolia.etherscan.io/address/${DEFAULT_CONTRACTS.pyth}`);
}

main().catch(console.error);
