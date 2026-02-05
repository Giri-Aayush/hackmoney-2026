'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOptionsChain, usePrice, useBuyOption } from '@/hooks/use-api';
import { OptionsChainEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Zap, RefreshCw } from 'lucide-react';

interface BuyDialogState {
  isOpen: boolean;
  optionId: string | null;
  type: 'call' | 'put';
  strike: number;
  expiry: number;
  premium: number;
  bid: number;
  ask: number;
}

export function OptionsChain() {
  const { isConnected } = useAccount();
  const [selectedExpiry, setSelectedExpiry] = useState<string | undefined>(undefined);
  const { data: chain, isLoading, refetch, isRefetching } = useOptionsChain(selectedExpiry);
  const { data: price } = usePrice();
  const buyOption = useBuyOption();

  const [buyDialog, setBuyDialog] = useState<BuyDialogState>({
    isOpen: false,
    optionId: null,
    type: 'call',
    strike: 0,
    expiry: 0,
    premium: 0,
    bid: 0,
    ask: 0,
  });

  const handleBuyClick = (
    entry: OptionsChainEntry,
    type: 'call' | 'put'
  ) => {
    const option = type === 'call' ? entry.call : entry.put;
    if (!option) return;

    setBuyDialog({
      isOpen: true,
      optionId: option.optionId,
      type,
      strike: entry.strike,
      expiry: entry.expiry,
      premium: option.premium,
      bid: option.bid,
      ask: option.ask,
    });
  };

  const handleConfirmBuy = async () => {
    if (!buyDialog.optionId) return;

    try {
      await buyOption.mutateAsync(buyDialog.optionId);
      toast.success(`${buyDialog.type.toUpperCase()} option purchased!`);
      setBuyDialog({ ...buyDialog, isOpen: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to buy option');
    }
  };

  const getMoneyness = (strike: number) => {
    if (!price?.price) return null;
    const diff = ((strike - price.price) / price.price) * 100;
    if (Math.abs(diff) < 1) return 'ATM';
    return diff > 0 ? 'OTM' : 'ITM';
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Protocol Options Chain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-white/5 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!chain || chain.chain.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Protocol Options Chain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No protocol options available yet.</p>
            <p className="text-sm mt-2">Options will be generated automatically.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-card">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Protocol Options</CardTitle>
                <p className="text-sm text-muted-foreground">
                  ETH/USD • Spot: ${chain.spotPrice.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={selectedExpiry || 'all'}
                onValueChange={(v) => setSelectedExpiry(v === 'all' ? undefined : v)}
              >
                <SelectTrigger className="w-[140px] bg-white/5 border-white/10">
                  <SelectValue placeholder="Expiry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Expiries</SelectItem>
                  {chain.expiries.map((exp) => (
                    <SelectItem key={exp} value={exp}>
                      {exp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="border-white/10 hover:bg-white/5"
              >
                <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {/* Desktop Header */}
          <div className="hidden lg:grid lg:grid-cols-[1fr_auto_1fr] gap-4 px-4 py-2 text-xs text-muted-foreground border-b border-white/5">
            <div className="grid grid-cols-4 gap-2 text-right">
              <span>Delta</span>
              <span>Bid</span>
              <span>Ask</span>
              <span>IV</span>
            </div>
            <div className="w-24 text-center font-medium">
              STRIKE
            </div>
            <div className="grid grid-cols-4 gap-2">
              <span>IV</span>
              <span>Bid</span>
              <span>Ask</span>
              <span>Delta</span>
            </div>
          </div>

          {/* Options Chain Rows */}
          <div className="divide-y divide-white/5">
            {chain.chain.map((entry) => {
              const moneyness = getMoneyness(entry.strike);
              const isATM = moneyness === 'ATM';

              return (
                <div
                  key={`${entry.strike}-${entry.expiry}`}
                  className={cn(
                    'grid lg:grid-cols-[1fr_auto_1fr] gap-2 lg:gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]',
                    isATM && 'bg-amber-500/5'
                  )}
                >
                  {/* Calls - Desktop */}
                  <div className="hidden lg:block">
                    {entry.call ? (
                      <button
                        onClick={() => handleBuyClick(entry, 'call')}
                        disabled={!isConnected}
                        className={cn(
                          'w-full grid grid-cols-4 gap-2 text-right items-center py-2 px-3 rounded-lg transition-all',
                          'hover:bg-emerald-500/10 group',
                          !isConnected && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span className="text-emerald-400 text-sm">
                          {entry.call.delta.toFixed(2)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ${entry.call.bid.toFixed(2)}
                        </span>
                        <span className="text-sm font-medium text-emerald-400 group-hover:text-emerald-300">
                          ${entry.call.ask.toFixed(2)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.call.iv.toFixed(0)}%
                        </span>
                      </button>
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>

                  {/* Strike Price */}
                  <div className={cn(
                    'w-full lg:w-24 flex items-center justify-between lg:justify-center gap-2',
                    'py-2 px-3 lg:px-0 rounded-lg lg:rounded-none',
                    isATM ? 'bg-amber-500/10 lg:bg-transparent' : 'bg-white/5 lg:bg-transparent'
                  )}>
                    <span className="lg:hidden text-xs text-muted-foreground">Strike</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-base">
                        ${entry.strike.toLocaleString()}
                      </span>
                      {moneyness && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5',
                            moneyness === 'ITM' && 'border-emerald-500/30 text-emerald-500',
                            moneyness === 'OTM' && 'border-red-500/30 text-red-500',
                            moneyness === 'ATM' && 'border-amber-500/30 text-amber-500'
                          )}
                        >
                          {moneyness}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Puts - Desktop */}
                  <div className="hidden lg:block">
                    {entry.put ? (
                      <button
                        onClick={() => handleBuyClick(entry, 'put')}
                        disabled={!isConnected}
                        className={cn(
                          'w-full grid grid-cols-4 gap-2 text-left items-center py-2 px-3 rounded-lg transition-all',
                          'hover:bg-red-500/10 group',
                          !isConnected && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span className="text-xs text-muted-foreground">
                          {entry.put.iv.toFixed(0)}%
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ${entry.put.bid.toFixed(2)}
                        </span>
                        <span className="text-sm font-medium text-red-400 group-hover:text-red-300">
                          ${entry.put.ask.toFixed(2)}
                        </span>
                        <span className="text-red-400 text-sm">
                          {entry.put.delta.toFixed(2)}
                        </span>
                      </button>
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>

                  {/* Mobile: Call and Put buttons */}
                  <div className="lg:hidden grid grid-cols-2 gap-2">
                    {entry.call ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBuyClick(entry, 'call')}
                        disabled={!isConnected}
                        className="border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                      >
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Call ${entry.call.ask.toFixed(2)}
                      </Button>
                    ) : (
                      <div />
                    )}
                    {entry.put ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBuyClick(entry, 'put')}
                        disabled={!isConnected}
                        className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                      >
                        <TrendingDown className="h-3 w-3 mr-1" />
                        Put ${entry.put.ask.toFixed(2)}
                      </Button>
                    ) : (
                      <div />
                    )}
                  </div>

                  {/* Expiry Label */}
                  <div className="lg:hidden flex justify-center">
                    <Badge variant="outline" className="text-[10px] border-white/10">
                      {entry.expiryLabel}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="px-4 pt-4 mt-4 border-t border-white/5">
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                <span>Calls (Bullish)</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-3 w-3 text-red-500" />
                <span>Puts (Bearish)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500">
                  ATM
                </Badge>
                <span>At The Money</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Buy Confirmation Dialog */}
      <Dialog open={buyDialog.isOpen} onOpenChange={(open) => setBuyDialog({ ...buyDialog, isOpen: open })}>
        <DialogContent className="bg-background/95 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {buyDialog.type === 'call' ? (
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
              Buy {buyDialog.type.toUpperCase()} Option
            </DialogTitle>
            <DialogDescription>
              Review and confirm your option purchase
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Type</span>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      buyDialog.type === 'call'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-red-500/10 text-red-500'
                    )}
                  >
                    {buyDialog.type.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Strike Price</span>
                <p className="font-medium">${buyDialog.strike.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Expiry</span>
                <p className="text-sm">{new Date(buyDialog.expiry * 1000).toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Current Spot</span>
                <p className="font-medium">${price?.price?.toFixed(2) ?? '---'}</p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Premium (Ask)</span>
                <span className={cn(
                  'text-xl font-semibold',
                  buyDialog.type === 'call' ? 'text-emerald-400' : 'text-red-400'
                )}>
                  ${buyDialog.ask.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                <span>Bid/Ask Spread</span>
                <span>${(buyDialog.ask - buyDialog.bid).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-amber-500">
              <Zap className="h-3 w-3" />
              <span>This trade is gasless via Yellow Network state channel</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBuyDialog({ ...buyDialog, isOpen: false })}
              className="border-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBuy}
              disabled={buyOption.isPending}
              className={cn(
                buyDialog.type === 'call'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              )}
            >
              {buyOption.isPending ? 'Processing...' : `Buy ${buyDialog.type.toUpperCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
