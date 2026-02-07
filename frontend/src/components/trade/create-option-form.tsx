'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateOption, usePrice } from '@/hooks/use-api';

export function CreateOptionForm() {
  const { address, isConnected } = useAccount();
  const { data: price } = usePrice();
  const createOption = useCreateOption();

  const [type, setType] = useState<'call' | 'put'>('call');
  const [strike, setStrike] = useState('');
  const [expiry, setExpiry] = useState('');
  const [premium, setPremium] = useState('');
  const [amount, setAmount] = useState('1');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!strike || !expiry || !premium || !amount) {
      toast.error('Please fill all fields');
      return;
    }

    const expiryDate = new Date(expiry);
    if (expiryDate <= new Date()) {
      toast.error('Expiry must be in the future');
      return;
    }

    try {
      await createOption.mutateAsync({
        type,
        strike: parseFloat(strike),
        expiry: expiryDate.getTime(),
        premium: parseFloat(premium),
        amount: parseInt(amount),
      });

      toast.success('Option created successfully!');
      setStrike('');
      setExpiry('');
      setPremium('');
      setAmount('1');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create option');
    }
  };

  // Generate quick strike buttons based on current price
  const currentPrice = price?.price || 2500;
  const quickStrikes = [
    Math.round(currentPrice * 0.9),
    Math.round(currentPrice * 0.95),
    Math.round(currentPrice),
    Math.round(currentPrice * 1.05),
    Math.round(currentPrice * 1.1),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Option</CardTitle>
        <CardDescription>
          Write a new option contract for others to buy
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Option Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Option Type</label>
            <Tabs value={type} onValueChange={(v) => setType(v as 'call' | 'put')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="call"
                  className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-500"
                >
                  Call
                </TabsTrigger>
                <TabsTrigger
                  value="put"
                  className="data-[state=active]:bg-red-500/10 data-[state=active]:text-red-500"
                >
                  Put
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Strike Price */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Strike Price (USD)</label>
            <Input
              type="number"
              placeholder="2500"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {quickStrikes.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStrike(s.toString())}
                  className="text-xs"
                >
                  ${s.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Expiry</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '1 Hour', minutes: 60 },
                { label: '4 Hours', minutes: 240 },
                { label: '1 Day', minutes: 1440 },
                { label: '1 Week', minutes: 10080 },
                { label: '1 Month', minutes: 43200 },
              ].map((opt) => {
                const expiryTime = new Date(Date.now() + opt.minutes * 60 * 1000);
                const value = expiryTime.toISOString().slice(0, 16);
                const isSelected = expiry === value;
                return (
                  <Button
                    key={opt.label}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setExpiry(value)}
                    className="text-xs"
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
            {expiry && (
              <p className="text-xs text-muted-foreground">
                Expires: {new Date(expiry).toLocaleString()}
              </p>
            )}
          </div>

          {/* Premium */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Premium (USDC)</label>
            <Input
              type="number"
              step="0.01"
              placeholder="10.00"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Contracts</label>
            <Select value={amount} onValueChange={setAmount}>
              <SelectTrigger>
                <SelectValue placeholder="Select amount" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 5, 10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={n.toString()}>
                    {n} contract{n > 1 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            disabled={!isConnected || createOption.isPending}
          >
            {createOption.isPending
              ? 'Creating...'
              : isConnected
              ? 'Create Option'
              : 'Connect Wallet to Create'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
