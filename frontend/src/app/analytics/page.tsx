'use client';

import { useState } from 'react';
import { useApiWallet, useStrategyTemplates, useOpenInterest, useVolume, usePrice, useBuildStrategy, useOptionsChain, useBuyOption, useCreateOption } from '@/hooks/use-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Activity,
  BarChart3,
  TrendingUp,
  Users,
  Target,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  PlayCircle
} from 'lucide-react';
import { StrategyTemplate, BuiltStrategy } from '@/lib/api';
import { useAccount } from 'wagmi';

interface ExecutionResult {
  legIndex: number;
  success: boolean;
  action: 'buy' | 'write';
  optionId?: string;
  error?: string;
}

export default function AnalyticsPage() {
  useApiWallet();
  const { address } = useAccount();
  const { data: templates, isLoading: templatesLoading } = useStrategyTemplates();
  const { data: openInterest, isLoading: oiLoading } = useOpenInterest();
  const { data: volume } = useVolume();
  const { data: priceData } = usePrice();
  const { data: optionsChain } = useOptionsChain();
  const buildStrategy = useBuildStrategy();
  const buyOption = useBuyOption();
  const createOption = useCreateOption();

  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [builtStrategy, setBuiltStrategy] = useState<BuiltStrategy | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);

  const spotPrice = priceData?.price || 2500;

  const handleTemplateClick = (template: StrategyTemplate) => {
    setSelectedTemplate(template);
    // Initialize form values with defaults based on spot price
    const defaults: Record<string, string> = {
      expiryDays: '7',
    };
    if (template.requiredParams.includes('strike')) {
      defaults.strike = Math.round(spotPrice).toString();
    }
    if (template.requiredParams.includes('lowerStrike')) {
      defaults.lowerStrike = Math.round(spotPrice * 0.95).toString();
    }
    if (template.requiredParams.includes('upperStrike')) {
      defaults.upperStrike = Math.round(spotPrice * 1.05).toString();
    }
    if (template.requiredParams.includes('middleStrike')) {
      defaults.middleStrike = Math.round(spotPrice).toString();
    }
    if (template.requiredParams.includes('putStrike')) {
      defaults.putStrike = Math.round(spotPrice * 0.95).toString();
    }
    if (template.requiredParams.includes('callStrike')) {
      defaults.callStrike = Math.round(spotPrice * 1.05).toString();
    }
    if (template.requiredParams.includes('putBuyStrike')) {
      defaults.putBuyStrike = Math.round(spotPrice * 0.90).toString();
    }
    if (template.requiredParams.includes('putSellStrike')) {
      defaults.putSellStrike = Math.round(spotPrice * 0.95).toString();
    }
    if (template.requiredParams.includes('callSellStrike')) {
      defaults.callSellStrike = Math.round(spotPrice * 1.05).toString();
    }
    if (template.requiredParams.includes('callBuyStrike')) {
      defaults.callBuyStrike = Math.round(spotPrice * 1.10).toString();
    }
    setFormValues(defaults);
    setBuiltStrategy(null);
    setDialogOpen(true);
  };

  const handleBuildStrategy = async () => {
    if (!selectedTemplate) return;

    const params: Record<string, unknown> = {
      type: selectedTemplate.type,
      underlying: 'ETH',
      expiryDays: parseInt(formValues.expiryDays || '7'),
    };

    // Add all numeric form values
    for (const param of selectedTemplate.requiredParams) {
      if (param !== 'expiryDays' && formValues[param]) {
        params[param] = parseFloat(formValues[param]);
      }
    }

    try {
      const result = await buildStrategy.mutateAsync(params as Parameters<typeof buildStrategy.mutateAsync>[0]);
      setBuiltStrategy(result);
    } catch (error) {
      console.error('Failed to build strategy:', error);
    }
  };

  const getParamLabel = (param: string): string => {
    const labels: Record<string, string> = {
      strike: 'Strike Price',
      lowerStrike: 'Lower Strike',
      upperStrike: 'Upper Strike',
      middleStrike: 'Middle Strike',
      putStrike: 'Put Strike',
      callStrike: 'Call Strike',
      putBuyStrike: 'Put Buy Strike',
      putSellStrike: 'Put Sell Strike',
      callSellStrike: 'Call Sell Strike',
      callBuyStrike: 'Call Buy Strike',
      expiryDays: 'Days to Expiry',
    };
    return labels[param] || param;
  };

  const handleExecuteStrategy = async () => {
    if (!builtStrategy || !address) return;

    setIsExecuting(true);
    setExecutionResults([]);
    const results: ExecutionResult[] = [];

    for (let i = 0; i < builtStrategy.legs.length; i++) {
      const leg = builtStrategy.legs[i];

      try {
        if (leg.side === 'buy') {
          // For buy legs, find matching option in the chain and buy it
          const matchingOption = optionsChain?.chain.find(entry => {
            const strikeMatch = Math.abs(entry.strike - leg.strike) < 1;
            const option = leg.optionType === 'call' ? entry.call : entry.put;
            return strikeMatch && option !== null;
          });

          if (matchingOption) {
            const optionData = leg.optionType === 'call' ? matchingOption.call : matchingOption.put;
            if (optionData) {
              await buyOption.mutateAsync(optionData.optionId);
              results.push({
                legIndex: i,
                success: true,
                action: 'buy',
                optionId: optionData.optionId,
              });
            } else {
              throw new Error('Option data not found');
            }
          } else {
            // No matching option found - create one as a market maker would
            throw new Error(`No matching ${leg.optionType} option found at strike $${leg.strike}`);
          }
        } else {
          // For sell/write legs, create a new option
          const expiryTimestamp = builtStrategy.expiry * 1000;
          const result = await createOption.mutateAsync({
            type: leg.optionType,
            strike: leg.strike,
            expiry: expiryTimestamp,
            premium: leg.premium,
            amount: leg.quantity,
          });
          results.push({
            legIndex: i,
            success: true,
            action: 'write',
            optionId: result.id,
          });
        }
      } catch (error) {
        results.push({
          legIndex: i,
          success: false,
          action: leg.side === 'buy' ? 'buy' : 'write',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Update results after each leg
      setExecutionResults([...results]);
    }

    setIsExecuting(false);
  };

  return (
    <div className="container py-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Market insights and strategy templates
          </p>
        </div>

        {/* Market Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">24h Volume</CardTitle>
              <Activity className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <span className="gradient-text">$</span>{volume?.volume24h?.toFixed(2) || '0.00'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Trading volume
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">24h Trades</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {volume?.tradeCount24h || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Completed trades
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open Interest</CardTitle>
              <BarChart3 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {openInterest?.totalOpenInterest || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active contracts
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Traders</CardTitle>
              <Users className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {volume?.uniqueTraders24h || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active participants
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Open Interest by Strike */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-amber-500" />
              <CardTitle>Open Interest by Strike</CardTitle>
            </div>
            <CardDescription>Distribution of options across strike prices</CardDescription>
          </CardHeader>
          <CardContent>
            {oiLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-20 h-5 rounded bg-muted/50 animate-pulse" />
                    <div className="flex-1 h-4 rounded-full bg-muted/50 animate-pulse" />
                    <div className="w-28 h-5 rounded bg-muted/50 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : !openInterest?.byStrike || openInterest.byStrike.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-amber-500/10 mb-4">
                  <BarChart3 className="h-8 w-8 text-amber-500" />
                </div>
                <h3 className="font-semibold mb-2">No Open Interest Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Open interest data will appear here once options are created and traded.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {openInterest.byStrike.map((item, index) => (
                  <div key={`${item.strike}-${index}`} className="flex items-center gap-4">
                    <div className="w-24 text-sm font-medium font-mono">
                      ${item.strike.toLocaleString()}
                    </div>
                    <div className="flex-1">
                      <div className="flex h-6 rounded-full overflow-hidden bg-white/5">
                        <div
                          className="bg-emerald-500 transition-all flex items-center justify-center"
                          style={{
                            width: `${(item.calls / (item.total || 1)) * 100}%`,
                          }}
                        >
                          {item.calls > 0 && (
                            <span className="text-[10px] text-white font-medium">{item.calls}</span>
                          )}
                        </div>
                        <div
                          className="bg-red-500 transition-all flex items-center justify-center"
                          style={{
                            width: `${(item.puts / (item.total || 1)) * 100}%`,
                          }}
                        >
                          {item.puts > 0 && (
                            <span className="text-[10px] text-white font-medium">{item.puts}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="w-36 flex gap-3 text-sm">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <ArrowUpRight className="h-3 w-3" />
                        {item.calls} Calls
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <ArrowDownRight className="h-3 w-3" />
                        {item.puts} Puts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Strategy Templates */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-amber-500" />
              <CardTitle>Strategy Templates</CardTitle>
            </div>
            <CardDescription>
              Pre-built options strategies for different market conditions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="p-4 rounded-lg border border-white/5 bg-white/[0.01]">
                    <div className="h-5 w-32 rounded bg-muted/50 animate-pulse mb-3" />
                    <div className="h-4 w-full rounded bg-muted/50 animate-pulse mb-2" />
                    <div className="h-4 w-3/4 rounded bg-muted/50 animate-pulse mb-4" />
                    <div className="flex gap-2">
                      <div className="h-6 w-16 rounded-full bg-muted/50 animate-pulse" />
                      <div className="h-6 w-16 rounded-full bg-muted/50 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="p-4 rounded-full bg-muted/50 mb-4">
                  <Layers className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">No Strategy Templates</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Strategy templates will be available soon. Check back later!
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((template, i) => (
                  <button
                    key={i}
                    onClick={() => handleTemplateClick(template)}
                    className="p-4 rounded-lg border border-white/5 bg-white/[0.01] hover:border-amber-500/30 hover:bg-amber-500/5 transition-colors text-left cursor-pointer"
                  >
                    <h3 className="font-semibold mb-2">{template.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {template.description}
                    </p>
                    {template.legs && template.legs.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {template.legs.map((leg, j) => (
                          <Badge
                            key={j}
                            variant="outline"
                            className={
                              leg.type === 'call'
                                ? 'border-emerald-500/50 text-emerald-500 bg-emerald-500/5'
                                : 'border-red-500/50 text-red-500 bg-red-500/5'
                            }
                          >
                            {leg.position} {leg.type}
                            {leg.strikeOffset !== 0 &&
                              ` (${leg.strikeOffset > 0 ? '+' : ''}${leg.strikeOffset}%)`}
                          </Badge>
                        ))}
                      </div>
                    ) : template.requiredParams ? (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {template.requiredParams.map((param, j) => (
                          <Badge
                            key={j}
                            variant="outline"
                            className="border-amber-500/50 text-amber-500 bg-amber-500/5"
                          >
                            {param}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {(template.maxProfit || template.maxLoss || template.breakeven) && (
                      <div className="text-xs text-muted-foreground space-y-1 pt-3 border-t border-white/5">
                        {template.maxProfit && (
                          <div className="flex justify-between">
                            <span>Max Profit:</span>
                            <span className="text-emerald-500 font-medium">{template.maxProfit}</span>
                          </div>
                        )}
                        {template.maxLoss && (
                          <div className="flex justify-between">
                            <span>Max Loss:</span>
                            <span className="text-red-500 font-medium">{template.maxLoss}</span>
                          </div>
                        )}
                        {template.breakeven && (
                          <div className="flex justify-between">
                            <span>Breakeven:</span>
                            <span className="font-medium">{template.breakeven}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <span className="text-xs text-amber-500 font-medium">Click to configure →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Banner */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-500">Real-time Analytics</h3>
                <p className="text-sm text-muted-foreground">
                  All analytics data is updated in real-time from the Yellow Network state channels.
                  Start the backend server to see live data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strategy Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name || 'Build Strategy'}</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.description}
            </DialogDescription>
          </DialogHeader>

          {!builtStrategy ? (
            <>
              <div className="grid gap-4 py-4">
                <div className="text-sm text-muted-foreground mb-2">
                  Current ETH Price: <span className="text-amber-500 font-mono font-medium">${spotPrice.toFixed(2)}</span>
                </div>
                {selectedTemplate?.requiredParams.map((param) => (
                  <div key={param} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={param} className="text-right text-sm">
                      {getParamLabel(param)}
                    </Label>
                    <Input
                      id={param}
                      type="number"
                      value={formValues[param] || ''}
                      onChange={(e) => setFormValues({ ...formValues, [param]: e.target.value })}
                      className="col-span-3"
                      placeholder={param === 'expiryDays' ? 'Days' : 'Price in USD'}
                    />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleBuildStrategy}
                  disabled={buildStrategy.isPending}
                  className="bg-amber-500 hover:bg-amber-600 text-black"
                >
                  {buildStrategy.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Building...
                    </>
                  ) : (
                    'Build Strategy'
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="py-4 space-y-4">
                <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                  <h4 className="font-semibold mb-3">Strategy Legs</h4>
                  <div className="space-y-2">
                    {builtStrategy.legs.map((leg, i) => {
                      const result = executionResults.find(r => r.legIndex === i);
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {result ? (
                              result.success ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )
                            ) : isExecuting && executionResults.length === i ? (
                              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                            ) : null}
                            <Badge
                              variant="outline"
                              className={
                                leg.side === 'buy'
                                  ? 'border-emerald-500/50 text-emerald-500 bg-emerald-500/5'
                                  : 'border-red-500/50 text-red-500 bg-red-500/5'
                              }
                            >
                              {leg.side.toUpperCase()}
                            </Badge>
                            <span className={leg.optionType === 'call' ? 'text-emerald-500' : 'text-red-500'}>
                              {leg.optionType.toUpperCase()}
                            </span>
                          </div>
                          <div className="font-mono">
                            Strike: ${leg.strike.toFixed(2)}
                          </div>
                          <div className="font-mono text-muted-foreground">
                            ${leg.premium.toFixed(4)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {executionResults.some(r => !r.success) && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-red-400">
                        {executionResults.filter(r => !r.success).map(r => r.error).join(', ')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="text-muted-foreground mb-1">Net Debit</div>
                    <div className="font-mono font-semibold text-amber-500">
                      ${builtStrategy.netDebit.toFixed(4)}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="text-muted-foreground mb-1">Expiry</div>
                    <div className="font-mono font-semibold">
                      {new Date(builtStrategy.expiry * 1000).toLocaleDateString()}
                    </div>
                  </div>
                  {builtStrategy.maxProfit !== null && (
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <div className="text-muted-foreground mb-1">Max Profit</div>
                      <div className="font-mono font-semibold text-emerald-500">
                        {builtStrategy.maxProfit === Infinity ? 'Unlimited' : `$${builtStrategy.maxProfit.toFixed(4)}`}
                      </div>
                    </div>
                  )}
                  {builtStrategy.maxLoss !== null && (
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <div className="text-muted-foreground mb-1">Max Loss</div>
                      <div className="font-mono font-semibold text-red-500">
                        ${Math.abs(builtStrategy.maxLoss).toFixed(4)}
                      </div>
                    </div>
                  )}
                </div>

                {builtStrategy.breakevens.length > 0 && (
                  <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="text-muted-foreground mb-1 text-sm">Breakeven Points</div>
                    <div className="font-mono font-semibold">
                      {builtStrategy.breakevens.map((b) => `$${b.toFixed(2)}`).join(', ')}
                    </div>
                  </div>
                )}

                {executionResults.length > 0 && executionResults.every(r => r.success) && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-2 text-emerald-500">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-semibold">Strategy Executed Successfully!</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      All {executionResults.length} leg(s) have been executed. Check your Portfolio for positions.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => {
                  setBuiltStrategy(null);
                  setExecutionResults([]);
                  setDialogOpen(false);
                }}>
                  Close
                </Button>
                {executionResults.length === 0 ? (
                  <>
                    <Button
                      onClick={() => setBuiltStrategy(null)}
                      variant="outline"
                    >
                      Build Another
                    </Button>
                    <Button
                      onClick={handleExecuteStrategy}
                      disabled={isExecuting || !address}
                      className="bg-emerald-500 hover:bg-emerald-600 text-black"
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Executing...
                        </>
                      ) : !address ? (
                        'Connect Wallet'
                      ) : (
                        <>
                          <PlayCircle className="mr-2 h-4 w-4" />
                          Execute Strategy
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      setBuiltStrategy(null);
                      setExecutionResults([]);
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-black"
                  >
                    Build Another Strategy
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
