const RENDER_MONTHLY_COST_CENTS: Record<string, Record<string, number>> = {
  web_service: { free: 0, starter: 700, standard: 2500, pro: 8500 },
  background_worker: { free: 0, starter: 700, standard: 2500, pro: 8500 },
  private_service: { free: 0, starter: 700, standard: 2500, pro: 8500 },
  postgres: {
    free: 0,
    starter: 700,
    basic_256mb: 700,
    basic_1gb: 2000,
    pro_4gb: 9700,
  },
  redis: { free: 0, starter: 700, standard: 2500, pro: 8500 },
};

export function estimateMonthlyCostCents(kind: string, plan: string): number {
  return RENDER_MONTHLY_COST_CENTS[kind]?.[plan] ?? -1;
}

export function formatCost(cents: number): string {
  if (cents < 0) return "unknown";
  if (cents === 0) return "free";
  return `$${(cents / 100).toFixed(0)}/mo`;
}
