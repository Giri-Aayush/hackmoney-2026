'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOptions, usePrice, useBuyOption, useExerciseOption } from '@/hooks/use-api';
import { Option } from '@/lib/api';

export function OptionsTable() {
  const { isConnected } = useAccount();
  const { data: options, isLoading } = useOptions();
  const { data: price } = usePrice();
  const buyOption = useBuyOption();
  const exerciseOption = useExerciseOption();

  const [filter, setFilter] = useState<'all' | 'call' | 'put'>('all');
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [dialogAction, setDialogAction] = useState<'buy' | 'exercise' | null>(null);

  const filteredOptions =
    options?.filter((o) => {
      if (o.status !== 'open' && o.status !== 'filled') return false;
      if (filter === 'all') return true;
      return o.type === filter;
    }) || [];

  const handleBuy = async () => {
    if (!selectedOption) return;

    try {
      await buyOption.mutateAsync(selectedOption.id);
      toast.success('Option purchased successfully!');
      setDialogAction(null);
      setSelectedOption(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to buy option');
    }
  };

  const handleExercise = async () => {
    if (!selectedOption) return;

    try {
      await exerciseOption.mutateAsync(selectedOption.id);
      toast.success('Option exercised successfully!');
      setDialogAction(null);
      setSelectedOption(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to exercise option');
    }
  };

  const getOptionMoneyness = (option: Option) => {
    if (!price) return null;
    const currentPrice = price.price;

    if (option.type === 'call') {
      if (currentPrice > option.strike) return 'ITM';
      if (currentPrice === option.strike) return 'ATM';
      return 'OTM';
    } else {
      if (currentPrice < option.strike) return 'ITM';
      if (currentPrice === option.strike) return 'ATM';
      return 'OTM';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Options Chain</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Options Chain</CardTitle>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="call">Calls</TabsTrigger>
              <TabsTrigger value="put">Puts</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {filteredOptions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No options available. Create one to start trading!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Strike</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Greeks</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOptions.map((option) => {
                  const moneyness = getOptionMoneyness(option);
                  const isExpired = option.expiry < Date.now();

                  return (
                    <TableRow key={option.id}>
                      <TableCell>
                        <Badge
                          className={
                            option.type === 'call'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-red-500/10 text-red-500'
                          }
                        >
                          {option.type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        ${option.strike.toLocaleString()}
                        {moneyness && (
                          <span
                            className={`ml-2 text-xs ${
                              moneyness === 'ITM'
                                ? 'text-emerald-500'
                                : moneyness === 'OTM'
                                ? 'text-red-500'
                                : 'text-yellow-500'
                            }`}
                          >
                            {moneyness}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          {new Date(option.expiry).toLocaleDateString()}
                          <span className="block text-xs text-muted-foreground">
                            {new Date(option.expiry).toLocaleTimeString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>${option.premium.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            option.status === 'open'
                              ? 'outline'
                              : option.status === 'filled'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {option.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {option.greeks ? (
                          <div className="text-xs space-y-0.5">
                            <div>Delta: {option.greeks.delta.toFixed(3)}</div>
                            <div>Theta: {option.greeks.theta.toFixed(3)}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {option.status === 'open' && !isExpired && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedOption(option);
                              setDialogAction('buy');
                            }}
                            disabled={!isConnected}
                          >
                            Buy
                          </Button>
                        )}
                        {option.status === 'filled' &&
                          !isExpired &&
                          moneyness === 'ITM' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedOption(option);
                                setDialogAction('exercise');
                              }}
                              disabled={!isConnected}
                            >
                              Exercise
                            </Button>
                          )}
                        {isExpired && (
                          <span className="text-xs text-muted-foreground">
                            Expired
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Buy Dialog */}
      <Dialog open={dialogAction === 'buy'} onOpenChange={() => setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buy Option</DialogTitle>
            <DialogDescription>
              Confirm your purchase of this option contract
            </DialogDescription>
          </DialogHeader>
          {selectedOption && (
            <div className="space-y-4 py-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge
                  className={
                    selectedOption.type === 'call'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-red-500/10 text-red-500'
                  }
                >
                  {selectedOption.type.toUpperCase()}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Strike</span>
                <span className="font-medium">
                  ${selectedOption.strike.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expiry</span>
                <span>{new Date(selectedOption.expiry).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Premium</span>
                <span className="font-medium text-emerald-500">
                  ${selectedOption.premium.toFixed(2)} USDC
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>
              Cancel
            </Button>
            <Button onClick={handleBuy} disabled={buyOption.isPending}>
              {buyOption.isPending ? 'Processing...' : 'Confirm Purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exercise Dialog */}
      <Dialog
        open={dialogAction === 'exercise'}
        onOpenChange={() => setDialogAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exercise Option</DialogTitle>
            <DialogDescription>
              Exercise this option at the strike price
            </DialogDescription>
          </DialogHeader>
          {selectedOption && price && (
            <div className="space-y-4 py-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Price</span>
                <span className="font-medium">${price.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Strike Price</span>
                <span className="font-medium">
                  ${selectedOption.strike.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated P&L</span>
                <span
                  className={`font-medium ${
                    selectedOption.type === 'call'
                      ? price.price > selectedOption.strike
                        ? 'text-emerald-500'
                        : 'text-red-500'
                      : price.price < selectedOption.strike
                      ? 'text-emerald-500'
                      : 'text-red-500'
                  }`}
                >
                  $
                  {Math.abs(
                    selectedOption.type === 'call'
                      ? price.price - selectedOption.strike
                      : selectedOption.strike - price.price
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>
              Cancel
            </Button>
            <Button onClick={handleExercise} disabled={exerciseOption.isPending}>
              {exerciseOption.isPending ? 'Processing...' : 'Exercise Option'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
