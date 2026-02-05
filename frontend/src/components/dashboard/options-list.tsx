'use client';

import Link from 'next/link';
import { ArrowRight, TrendingUp, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOptions, usePrice } from '@/hooks/use-api';

export function OptionsList() {
  const { data: options, isLoading: optionsLoading } = useOptions();
  const { data: price } = usePrice();

  const openOptions = options?.filter((o) => o.status === 'open').slice(0, 5) || [];

  if (optionsLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Available Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                <div className="h-6 w-14 rounded bg-muted animate-pulse" />
                <div className="h-5 w-20 rounded bg-muted animate-pulse" />
                <div className="h-5 w-24 rounded bg-muted animate-pulse" />
                <div className="h-5 w-16 rounded bg-muted animate-pulse ml-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (openOptions.length === 0) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Available Options
          </CardTitle>
          <Link href="/trade">
            <Button variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-2 h-4 w-4" />
              Create Option
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-emerald-500/10 mb-4">
              <TrendingUp className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="font-semibold mb-2">No Options Available</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Be the first to create an option contract and start trading on the marketplace.
            </p>
            <Link href="/trade">
              <Button variant="outline" size="sm">
                Start Trading
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          Available Options
        </CardTitle>
        <Link href="/trade">
          <Button variant="outline" size="sm">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-muted-foreground">Type</TableHead>
                <TableHead className="text-muted-foreground">Strike</TableHead>
                <TableHead className="text-muted-foreground hidden sm:table-cell">Expiry</TableHead>
                <TableHead className="text-muted-foreground">Premium</TableHead>
                <TableHead className="text-right text-muted-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openOptions.map((option) => {
                const isITM = price
                  ? option.type === 'call'
                    ? price.price > option.strike
                    : price.price < option.strike
                  : false;

                return (
                  <TableRow key={option.id} className="hover:bg-muted/30 border-border/50">
                    <TableCell>
                      <Badge
                        variant={option.type === 'call' ? 'default' : 'secondary'}
                        className={
                          option.type === 'call'
                            ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20'
                        }
                      >
                        {option.type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      ${option.strike.toLocaleString()}
                      {isITM && (
                        <Badge variant="outline" className="ml-2 text-[10px] h-5 px-1.5 text-emerald-500 border-emerald-500/30">
                          ITM
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {new Date(option.expiry).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">${option.premium.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/trade?option=${option.id}`}>
                        <Button size="sm" variant="outline" className="h-8">
                          Trade
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
