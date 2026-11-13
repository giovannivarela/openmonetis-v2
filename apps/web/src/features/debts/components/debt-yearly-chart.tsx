import type { DebtScheduleYearOutput } from "@openmonetis/validators/debts";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartLegendMarker } from "@/components/chart-legend-marker";
import { MoneyValue } from "@/components/money-value";
import { usePrivacyMode } from "@/components/privacy-provider";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatChartAxisAmount } from "@/lib/money-presentation";
import { cn } from "@/lib/utils";

const chartConfig = {
  amortization: { label: "Amortização", color: "var(--chart-2)" },
  interest: { label: "Juros", color: "var(--chart-1)" },
  charges: {
    label: "Seguros e tarifa",
    color: "color-mix(in srgb, var(--muted-foreground) 70%, var(--background))",
  },
} satisfies ChartConfig;
const segments = ["amortization", "interest", "charges"] as const;
/** Years with only installments still to come are drawn lighter. */
const remainingOpacity = 0.6;

export function DebtYearlyChart({ years }: { years: DebtScheduleYearOutput[] }) {
  const { isPrivacyModeEnabled } = usePrivacyMode();

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
        <BarChart data={years} margin={{ left: 0, right: 4, top: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="year"
            minTickGap={4}
            tickFormatter={(value) => `’${String(value).slice(2)}`}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            axisLine={false}
            tickFormatter={(value) => formatChartAxisAmount(Number(value))}
            tickLine={false}
            width={88}
          />
          <ChartTooltip
            content={({ active, payload }) => {
              const year = payload?.[0]?.payload as DebtScheduleYearOutput | undefined;
              if (!active || !year) return null;
              return <YearTooltip year={year} />;
            }}
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          />
          {segments.map((key, index) => (
            <Bar
              dataKey={key}
              fill={`var(--color-${key})`}
              isAnimationActive={false}
              key={key}
              maxBarSize={30}
              radius={index === segments.length - 1 ? [4, 4, 0, 0] : 0}
              stackId="installment"
            >
              {years.map((year) => (
                <Cell fillOpacity={year.remainingOnly ? remainingOpacity : 1} key={year.year} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      <div
        aria-hidden="true"
        className={cn(
          "flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground text-xs",
          isPrivacyModeEnabled && "blur-sm select-none",
        )}
      >
        {segments.map((key) => (
          <span className="flex items-center gap-1.5" key={key}>
            <ChartLegendMarker color={chartConfig[key].color} />
            {chartConfig[key].label}
          </span>
        ))}
        <span>Barras claras: anos ainda por vir</span>
      </div>
    </div>
  );
}

function YearTooltip({ year }: { year: DebtScheduleYearOutput }) {
  return (
    <div className="grid min-w-52 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">
        {year.year} · {year.installments} {year.installments === 1 ? "parcela" : "parcelas"}
        {year.remainingOnly ? " a vencer" : ""}
      </p>
      {segments.map((key) => (
        <p className="flex items-center gap-1.5" key={key}>
          <ChartLegendMarker color={chartConfig[key].color} />
          <span className="text-muted-foreground">{chartConfig[key].label}</span>
          <MoneyValue amount={year[key]} className="ml-auto font-medium" />
        </p>
      ))}
      <p className="flex items-center gap-1.5 border-t pt-1 font-medium">
        Total das parcelas
        <MoneyValue amount={year.total} className="ml-auto" />
      </p>
      {year.extraPrincipal > 0 ? (
        <p className="flex items-center gap-1.5 text-info">
          Extras no principal
          <MoneyValue amount={year.extraPrincipal} className="ml-auto" />
        </p>
      ) : null}
    </div>
  );
}
