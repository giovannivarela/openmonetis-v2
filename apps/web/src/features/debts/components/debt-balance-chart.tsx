import type { DebtDetailOutput } from "@openmonetis/validators/debts";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartLegendMarker } from "@/components/chart-legend-marker";
import { MoneyValue } from "@/components/money-value";
import { usePrivacyMode } from "@/components/privacy-provider";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatChartAxisAmount } from "@/lib/money-presentation";
import { cn } from "@/lib/utils";
import {
  buildDebtBalanceSeries,
  type DebtBalancePoint,
  debtBalanceYearTicks,
  formatDebtDate,
  formatDebtMonth,
} from "../debts.presentation";

const chartConfig = {
  recorded: { label: "Saldo até hoje", color: "var(--chart-2)" },
  projected: { label: "Projeção", color: "var(--chart-2)" },
  extra: { label: "Amortização extra", color: "var(--info)" },
} satisfies ChartConfig;

/** Shorter debts get a tick every year; long ones every two, so labels never collide. */
const yearsPerTick = (installments: number) => (installments > 96 ? 2 : 1);

export function DebtBalanceChart({ debt }: { debt: DebtDetailOutput }) {
  const { isPrivacyModeEnabled } = usePrivacyMode();
  const series = buildDebtBalanceSeries(debt.terms, debt.schedule, debt.summary.paidInstallments);
  const today = series[debt.summary.paidInstallments]?.date;
  const hasExtras = series.some((point) => point.extra !== null);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <ChartContainer
        aria-hidden="true"
        className={cn(
          "h-56 w-full transition-[filter] sm:h-64",
          isPrivacyModeEnabled && "pointer-events-none blur-sm select-none",
        )}
        config={chartConfig}
      >
        <ComposedChart data={series} margin={{ left: 0, right: 12, top: 18 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="date"
            tickFormatter={(value) => String(value).slice(0, 4)}
            tickLine={false}
            tickMargin={8}
            ticks={debtBalanceYearTicks(series, yearsPerTick(debt.schedule.length))}
          />
          <YAxis
            axisLine={false}
            tickFormatter={(value) => formatChartAxisAmount(Number(value))}
            tickLine={false}
            width={88}
          />
          <ChartTooltip
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as DebtBalancePoint | undefined;
              if (!active || !point) return null;
              return <BalanceTooltip point={point} />;
            }}
            cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.3 }}
          />
          <Area
            activeDot={false}
            dataKey="recorded"
            dot={false}
            fill="var(--color-recorded)"
            fillOpacity={0.14}
            isAnimationActive={false}
            stroke="var(--color-recorded)"
            strokeWidth={2}
            type="linear"
          />
          <Line
            activeDot={{ r: 4 }}
            dataKey="projected"
            dot={false}
            isAnimationActive={false}
            stroke="var(--color-projected)"
            strokeDasharray="5 4"
            strokeWidth={2}
            type="linear"
          />
          <Line
            activeDot={false}
            dataKey="extra"
            dot={{ r: 4.5, fill: "var(--card)", stroke: "var(--color-extra)", strokeWidth: 2 }}
            isAnimationActive={false}
            stroke="none"
            type="linear"
          />
          {today ? (
            <ReferenceLine
              label={{
                value: "Hoje",
                position: "insideTopRight",
                fill: "var(--brand-strong)",
                fontSize: 11,
                fontWeight: 600,
              }}
              stroke="var(--brand)"
              strokeDasharray="3 3"
              x={today}
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>
      <div
        aria-hidden="true"
        className={cn(
          "flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground text-xs",
          isPrivacyModeEnabled && "blur-sm select-none",
        )}
      >
        <span className="flex items-center gap-1.5">
          <ChartLegendMarker color={chartConfig.recorded.color} variant="line" />
          {chartConfig.recorded.label}
        </span>
        <span className="flex items-center gap-1.5">
          <ChartLegendMarker color={chartConfig.projected.color} variant="dashed" />
          {chartConfig.projected.label}
        </span>
        {hasExtras ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-info" />
            {chartConfig.extra.label}
          </span>
        ) : null}
      </div>
      <p className="sr-only">
        Saldo devedor de {debt.terms.principal.toLocaleString("pt-BR")} reais no contrato até a
        quitação em {formatDebtMonth(debt.summary.lastDueDate)}.
      </p>
    </div>
  );
}

function BalanceTooltip({ point }: { point: DebtBalancePoint }) {
  return (
    <div className="grid min-w-48 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">
        {point.number === null
          ? `Contrato · ${formatDebtDate(point.date)}`
          : `Parcela ${point.number} · ${formatDebtDate(point.date)}`}
      </p>
      {point.installment !== null ? (
        <p className="flex items-center gap-1.5">
          <span className="text-muted-foreground">
            {point.recorded === null ? "Parcela projetada" : "Parcela"}
          </span>
          <MoneyValue amount={point.installment} className="ml-auto font-medium" />
        </p>
      ) : null}
      {point.extraPrincipal > 0 ? (
        <p className="flex items-center gap-1.5 text-info">
          Extra no principal
          <MoneyValue amount={point.extraPrincipal} className="ml-auto font-medium" />
        </p>
      ) : null}
      <p className="flex items-center gap-1.5">
        <span className="text-muted-foreground">
          {point.number === null ? "Valor financiado" : "Saldo após a parcela"}
        </span>
        <MoneyValue amount={point.balance} className="ml-auto font-medium" />
      </p>
    </div>
  );
}
