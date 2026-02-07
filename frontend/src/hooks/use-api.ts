'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useEffect } from 'react';
import { api, Option, TradingBalance } from '@/lib/api';

// Set wallet address when account changes
export function useApiWallet() {
  const { address } = useAccount();

  useEffect(() => {
    api.setWalletAddress(address || null);
  }, [address]);
}

// Price hook
export function usePrice() {
  return useQuery({
    queryKey: ['price'],
    queryFn: () => api.getPrice(),
    refetchInterval: 1000, // Refetch every second for real-time trading feel
  });
}

// Options hooks
export function useOptions() {
  return useQuery({
    queryKey: ['options'],
    queryFn: () => api.getOptions(),
    refetchInterval: 30000,
  });
}

export function useOptionStats() {
  return useQuery({
    queryKey: ['option-stats'],
    queryFn: () => api.getOptionStats(),
    refetchInterval: 30000,
  });
}

export function useCreateOption() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: (option: {
      type: 'call' | 'put';
      strike: number;
      expiry: number;
      premium: number;
      amount: number;
    }) => {
      // Ensure wallet address is set before making the request
      if (address) {
        api.setWalletAddress(address);
      }
      return api.createOption(option);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options'] });
      queryClient.invalidateQueries({ queryKey: ['option-stats'] });
    },
  });
}

export function useBuyOption() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: (optionId: string) => {
      if (address) {
        api.setWalletAddress(address);
      }
      return api.buyOption(optionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options'] });
      queryClient.invalidateQueries({ queryKey: ['options-chain'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['volume'] });
      queryClient.invalidateQueries({ queryKey: ['trading-balance'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}

export function useExerciseOption() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: (optionId: string) => {
      if (address) {
        api.setWalletAddress(address);
      }
      return api.exerciseOption(optionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options'] });
      queryClient.invalidateQueries({ queryKey: ['options-chain'] });
      queryClient.invalidateQueries({ queryKey: ['open-interest'] });
    },
  });
}

// Market hooks
export function useVolume() {
  return useQuery({
    queryKey: ['volume'],
    queryFn: () => api.getVolume(),
    refetchInterval: 30000,
  });
}

export function useOpenInterest() {
  return useQuery({
    queryKey: ['open-interest'],
    queryFn: () => api.getOpenInterest(),
    refetchInterval: 30000,
  });
}

export function useMarketDepth(optionId: string) {
  return useQuery({
    queryKey: ['market-depth', optionId],
    queryFn: () => api.getMarketDepth(optionId),
    enabled: !!optionId,
    refetchInterval: 10000,
  });
}

export function useRecentTrades(limit?: number) {
  return useQuery({
    queryKey: ['trades', limit],
    queryFn: () => api.getRecentTrades(limit),
    refetchInterval: 15000,
  });
}

// Strategy hooks
export function useStrategyTemplates() {
  return useQuery({
    queryKey: ['strategy-templates'],
    queryFn: () => api.getStrategyTemplates(),
  });
}

export function useBuildStrategy() {
  return useMutation({
    mutationFn: (params: Parameters<typeof api.buildStrategy>[0]) => api.buildStrategy(params),
  });
}

// User positions (bought and written options)
export function usePositions() {
  const { address } = useAccount();

  return useQuery({
    queryKey: ['positions', address],
    queryFn: () => {
      if (address) {
        api.setWalletAddress(address);
      }
      return api.getPositions();
    },
    enabled: !!address,
    refetchInterval: 1000, // Refetch every second for real-time pricing
  });
}

// Protocol options chain (Binance-style)
export function useOptionsChain(expiry?: string) {
  return useQuery({
    queryKey: ['options-chain', expiry],
    queryFn: () => api.getOptionsChain(expiry),
    refetchInterval: 15000, // Refresh every 15 seconds
  });
}

export function useRefreshOptionsChain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.refreshOptionsChain(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options-chain'] });
      queryClient.invalidateQueries({ queryKey: ['options'] });
    },
  });
}

// Trading balance hooks
export function useTradingBalance() {
  const { address } = useAccount();

  return useQuery({
    queryKey: ['trading-balance', address],
    queryFn: () => {
      if (address) {
        api.setWalletAddress(address);
      }
      return api.getTradingBalance();
    },
    enabled: !!address,
    refetchInterval: 1000, // Refresh every second for real-time balance updates
  });
}

export function useSyncDeposit() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: ({ amount, txHash }: { amount: number; txHash?: string }) => {
      if (address) {
        api.setWalletAddress(address);
      }
      return api.syncDeposit(amount, txHash);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trading-balance'] });
    },
  });
}
