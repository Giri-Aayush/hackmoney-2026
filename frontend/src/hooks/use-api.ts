'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useEffect } from 'react';
import { api, Option } from '@/lib/api';

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
    refetchInterval: 10000, // Refetch every 10 seconds
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

  return useMutation({
    mutationFn: (option: {
      type: 'call' | 'put';
      strike: number;
      expiry: number;
      premium: number;
      amount: number;
    }) => api.createOption(option),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options'] });
      queryClient.invalidateQueries({ queryKey: ['option-stats'] });
    },
  });
}

export function useBuyOption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (optionId: string) => api.buyOption(optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['volume'] });
    },
  });
}

export function useExerciseOption() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (optionId: string) => api.exerciseOption(optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options'] });
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
