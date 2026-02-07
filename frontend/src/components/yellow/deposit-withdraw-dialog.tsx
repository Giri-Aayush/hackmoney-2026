'use client';

import { useState, useEffect } from 'react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import { toast } from 'sonner';
import { useSyncDeposit } from '@/hooks/use-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowDownRight, ArrowUpRight, ExternalLink, Zap } from 'lucide-react';
import { useYellow } from '@/lib/yellow';

// Contract addresses on Sepolia
const OPTICHANNEL_CONTRACT = '0x7779c5E338e52Be395A2A5386f8CFBf6629f67CB' as Address;
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;

// USDC ABI for approve
const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Optix ABI for deposit/withdraw
const OPTICHANNEL_ABI = [
  {
    name: 'deposit',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
] as const;

interface DepositWithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'deposit' | 'withdraw';
}

export function DepositWithdrawDialog({
  open,
  onOpenChange,
  defaultTab = 'deposit',
}: DepositWithdrawDialogProps) {
  const { address } = useAccount();
  const { balances, refreshBalances, isAuthenticated } = useYellow();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(defaultTab);
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'input' | 'approving' | 'depositing' | 'withdrawing' | 'success'>('input');
  const syncDeposit = useSyncDeposit();

  // Get USDC balance
  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_ADDRESS,
  });

  // Get state channel balance
  const channelBalance = balances.find((b) => b.asset === 'usdc' || b.symbol === 'USDC');
  const channelBalanceFormatted = channelBalance
    ? parseFloat(channelBalance.available) / 1e6
    : 0;

  // Contract write hooks
  const { writeContract: approve, data: approveHash } = useWriteContract();
  const { writeContract: deposit, data: depositHash } = useWriteContract();
  const { writeContract: withdraw, data: withdrawHash } = useWriteContract();

  // Wait for transactions
  const { isLoading: isApproving, isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isLoading: isDepositing, isSuccess: depositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  const { isLoading: isWithdrawing, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  // Handle deposit
  const handleDeposit = async () => {
    if (!amount || !address) return;

    try {
      const amountInUnits = parseUnits(amount, 6);

      // Step 1: Approve
      setStep('approving');
      approve({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [OPTICHANNEL_CONTRACT, amountInUnits],
      });
    } catch (error) {
      console.error('Deposit failed:', error);
      toast.error('Deposit failed');
      setStep('input');
    }
  };

  // Effect to handle approve success -> deposit
  useEffect(() => {
    if (approveSuccess && step === 'approving') {
      setStep('depositing');
      const amountInUnits = parseUnits(amount, 6);
      deposit({
        address: OPTICHANNEL_CONTRACT,
        abi: OPTICHANNEL_ABI,
        functionName: 'deposit',
        args: [amountInUnits],
      });
    }
  }, [approveSuccess, step, amount, deposit]);

  // Effect to handle deposit success
  useEffect(() => {
    if (depositSuccess && step === 'depositing') {
      setStep('success');
      toast.success('Deposit successful!');
      refreshBalances();

      // Sync trading balance with deposited amount
      const depositAmount = parseFloat(amount);
      if (depositAmount > 0 && depositHash) {
        syncDeposit.mutate({
          amount: depositAmount,
          txHash: depositHash,
        });
      }

      setTimeout(() => {
        setStep('input');
        setAmount('');
        onOpenChange(false);
      }, 2000);
    }
  }, [depositSuccess, step, amount, depositHash, refreshBalances, syncDeposit, onOpenChange]);

  // Handle withdraw
  const handleWithdraw = async () => {
    if (!amount || !address) return;

    try {
      const amountInUnits = parseUnits(amount, 6);

      setStep('withdrawing');
      withdraw({
        address: OPTICHANNEL_CONTRACT,
        abi: OPTICHANNEL_ABI,
        functionName: 'withdraw',
        args: [amountInUnits],
      });
    } catch (error) {
      console.error('Withdraw failed:', error);
      toast.error('Withdraw failed');
      setStep('input');
    }
  };

  // Effect to handle withdraw success
  useEffect(() => {
    if (withdrawSuccess && step === 'withdrawing') {
      setStep('success');
      toast.success('Withdrawal successful!');
      refreshBalances();
      setTimeout(() => {
        setStep('input');
        setAmount('');
        onOpenChange(false);
      }, 2000);
    }
  }, [withdrawSuccess, step, refreshBalances, onOpenChange]);

  const isLoading = isApproving || isDepositing || isWithdrawing;
  const maxDeposit = usdcBalance ? parseFloat(formatUnits(usdcBalance.value, 6)) : 0;
  const maxWithdraw = channelBalanceFormatted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-500" />
            Manage State Channel Funds
          </DialogTitle>
          <DialogDescription>
            Deposit USDC to trade gaslessly, or withdraw to your wallet
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'deposit' | 'withdraw')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deposit" className="flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Deposit
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-4 mt-4">
            {/* Wallet Balance */}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Wallet Balance</span>
              <span className="font-medium">
                {maxDeposit.toFixed(2)} USDC
              </span>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isLoading}
                  className="pr-20"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs"
                  onClick={() => setAmount(maxDeposit.toString())}
                  disabled={isLoading}
                >
                  MAX
                </Button>
              </div>
            </div>

            {/* Info */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <p>
                Depositing USDC locks it in the Optix smart contract.
                You can trade gaslessly and withdraw anytime.
              </p>
            </div>

            {/* Action Button */}
            <Button
              className="w-full"
              onClick={handleDeposit}
              disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > maxDeposit || isLoading}
            >
              {isApproving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving USDC...
                </>
              ) : isDepositing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Depositing...
                </>
              ) : (
                <>
                  <ArrowDownRight className="h-4 w-4 mr-2" />
                  Deposit {amount || '0'} USDC
                </>
              )}
            </Button>

            {/* Transaction Link */}
            {(approveHash || depositHash) && (
              <a
                href={`https://sepolia.etherscan.io/tx/${depositHash || approveHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View on Etherscan
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4 mt-4">
            {/* Channel Balance */}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Channel Balance</span>
              <span className="font-medium">
                {channelBalanceFormatted.toFixed(2)} USDC
              </span>
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isLoading}
                  className="pr-20"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs"
                  onClick={() => setAmount(maxWithdraw.toString())}
                  disabled={isLoading}
                >
                  MAX
                </Button>
              </div>
            </div>

            {/* Warning if not authenticated */}
            {!isAuthenticated && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm">
                <p className="text-yellow-500">
                  Enable gasless trading first to see your channel balance.
                </p>
              </div>
            )}

            {/* Info */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <p>
                Withdrawing settles your state channel balance on-chain.
                This requires a gas fee.
              </p>
            </div>

            {/* Action Button */}
            <Button
              className="w-full"
              onClick={handleWithdraw}
              disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > maxWithdraw || isLoading}
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                <>
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Withdraw {amount || '0'} USDC
                </>
              )}
            </Button>

            {/* Transaction Link */}
            {withdrawHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${withdrawHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View on Etherscan
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
