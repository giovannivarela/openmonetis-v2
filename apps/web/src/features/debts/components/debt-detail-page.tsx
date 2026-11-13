import type { DebtDetailOutput } from "@openmonetis/validators/debts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  CalendarClock,
  ChevronsUpDown,
  Pencil,
  Percent,
  Trash2,
  TrendingDown,
  Upload,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { CardActionsMenu } from "@/components/card-actions-menu";
import { EntityLoadError } from "@/components/entity-load-error";
import { MoneyValue } from "@/components/money-value";
import { Navbar } from "@/components/navigation/navbar";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteDebtMutation } from "../debts.mutations";
import {
  debtBankLabel,
  formatDebtAnnualRate,
  formatDebtCorrectionRate,
  formatDebtDate,
  formatDebtMonth,
  getUpcomingDebtInstallments,
} from "../debts.presentation";
import { debtQueryOptions, debtsQueryOptions } from "../debts.queries";
import { DebtBalanceChart } from "./debt-balance-chart";
import { DebtCorrectionForm } from "./debt-correction-form";
import { DebtExpensesCard } from "./debt-expenses-card";
import { DebtExtrasList } from "./debt-extras-list";
import { DebtImportDialog } from "./debt-import-dialog";
import { DebtRenameDialog } from "./debt-rename-dialog";
import { DebtScheduleTable } from "./debt-schedule-table";
import { DebtYearlyChart } from "./debt-yearly-chart";

export function DebtDetailPage({ debtId }: { debtId: string }) {
  const debtQuery = useQuery(debtQueryOptions(debtId));
  const debt = debtQuery.data;

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        {debtQuery.isError ? (
          <EntityLoadError
            entity="a dívida"
            error={debtQuery.error}
            onRetry={() => void debtQuery.refetch()}
          >
            <DebtNotFound />
          </EntityLoadError>
        ) : (
          <section className="app-page project-container">
            {debt ? <DebtDetail debt={debt} /> : <DebtDetailSkeleton />}
          </section>
        )}
      </main>
    </ProtectedRoute>
  );
}

function DebtDetail({ debt }: { debt: DebtDetailOutput }) {
  const navigate = useNavigate();
  const deleteMutation = useDeleteDebtMutation();
  const [importOpen, setImportOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { summary } = debt;
  const upcoming = getUpcomingDebtInstallments(debt.schedule, summary.paidInstallments);

  async function remove() {
    try {
      await deleteMutation.mutateAsync(debt.id);
      toast.success("Dívida excluída");
      await navigate({ to: "/debts" });
    } catch {
      toast.error("Não foi possível excluir a dívida.");
    }
  }

  return (
    <>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DebtSwitcher currentId={debt.id} />
            <Button onClick={() => setImportOpen(true)} type="button" variant="outline">
              <Upload aria-hidden="true" className="size-4" /> Importar extrato
            </Button>
            <CardActionsMenu label={`Mais ações para ${debt.name}`}>
              <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                <Pencil aria-hidden="true" /> Renomear
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRemoveOpen(true)} variant="destructive">
                <Trash2 aria-hidden="true" /> Excluir dívida
              </DropdownMenuItem>
            </CardActionsMenu>
          </div>
        }
        breadcrumbs={[
          { label: "Visão geral", href: "/dashboard" },
          { label: "Finanças" },
          { label: "Dívidas", href: "/debts" },
          { label: debt.name },
        ]}
        description={`${debtBankLabel(debt.bank)} · SAC · ${formatDebtAnnualRate(debt.terms.annualEffectiveRate)} + TR · contrato de ${formatDebtMonth(debt.terms.contractDate)} · extrato de ${formatDebtDate(debt.statementIssuedOn)}`}
        icon={<Banknote aria-hidden="true" className="size-5" />}
        title={debt.name}
      />

      <Card aria-label="Saldo devedor" className="min-w-0 gap-5 px-5 py-5 sm:px-6" role="region">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-0.5">
            <p className="text-muted-foreground text-sm">Saldo devedor hoje</p>
            <MoneyValue
              amount={summary.currentBalance}
              className="font-semibold text-3xl tracking-tight"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.monthsCut > 0 ? (
              <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-xs">
                {summary.monthsCut} meses a menos com extras
              </span>
            ) : null}
            {debt.extraAmortizations.length > 0 ? (
              <span className="rounded-full bg-info/12 px-2.5 py-1 font-medium text-info text-xs">
                {debt.extraAmortizations.length}{" "}
                {debt.extraAmortizations.length === 1 ? "amortização extra" : "amortizações extras"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid gap-0.5">
          <h2 className="font-heading font-medium text-base">Evolução do saldo devedor</h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Do contrato até a quitação em {formatDebtMonth(summary.lastDueDate)}: o que já venceu e
            a projeção.
          </p>
        </div>
        <DebtBalanceChart debt={debt} />
      </Card>

      <section
        aria-label="Indicadores da dívida"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          description={
            debt.nextInstallment
              ? `nº ${debt.nextInstallment.number} · vence ${formatDebtDate(debt.nextInstallment.dueDate)}`
              : undefined
          }
          icon={<CalendarClock />}
          label="Próxima parcela"
          value={
            debt.nextInstallment ? <MoneyValue amount={debt.nextInstallment.amount} /> : "Quitada"
          }
        />
        <StatCard
          description={`${summary.paidInstallments} parcelas e ${debt.extraAmortizations.length} extras`}
          icon={<Wallet />}
          label="Total pago até hoje"
          value={<MoneyValue amount={summary.paidOut} />}
        />
        <StatCard
          description="nas parcelas que já venceram"
          icon={<Percent />}
          label="Juros pagos"
          value={<MoneyValue amount={summary.paid.interest} />}
        />
        <StatCard
          description={`projeção com TR de ${formatDebtCorrectionRate(debt.projectedMonthlyCorrectionRate)}% a.m.`}
          icon={<TrendingDown />}
          label="Juros a pagar"
          value={<MoneyValue amount={summary.remaining.interest} />}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-3 lg:items-stretch">
        <Card className="min-w-0 gap-4 px-5 py-5 sm:px-6 lg:col-span-2">
          <div className="grid gap-0.5">
            <h2 className="font-heading font-medium text-base">Para onde vai cada parcela</h2>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Soma anual de amortização, juros e encargos. No SAC, os juros caem a cada mês.
            </p>
          </div>
          <DebtYearlyChart years={debt.yearlyBreakdown} />
          <div className="border-t pt-4">
            <DebtCorrectionForm
              debtId={debt.id}
              key={debt.projectedMonthlyCorrectionRate}
              rate={debt.projectedMonthlyCorrectionRate}
            />
          </div>
        </Card>
        <Card className="min-w-0 gap-2 px-5 py-5 sm:px-6">
          <div className="grid gap-0.5">
            <h2 className="font-heading font-medium text-base">Amortizações extras</h2>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {summary.monthsCut > 0
                ? `Encurtaram o contrato em ${summary.monthsCut} meses.`
                : "Valores pagos além das parcelas."}
            </p>
          </div>
          <div className="relative lg:min-h-0 lg:flex-1">
            <DebtExtrasList extras={debt.extraAmortizations} />
          </div>
        </Card>
      </div>

      <Card className="gap-3 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 className="font-heading font-medium text-base">
              {showAll ? "Cronograma completo" : "Próximas parcelas"}
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {summary.remainingInstallments} de {debt.schedule.length} parcelas a vencer
            </p>
          </div>
          <Button
            onClick={() => setShowAll((value) => !value)}
            size="sm"
            type="button"
            variant="outline"
          >
            {showAll ? "Mostrar só as próximas" : `Ver as ${debt.schedule.length} parcelas`}
          </Button>
        </div>
        {debt.schedule.length > 0 ? (
          <div className={showAll ? "max-h-[28rem] overflow-auto" : "overflow-x-auto"}>
            <DebtScheduleTable
              rows={showAll ? debt.schedule : upcoming}
              todayAfter={summary.paidInstallments}
            />
          </div>
        ) : null}
      </Card>

      <DebtExpensesCard debt={debt} />

      <DebtImportDialog
        onImported={(imported) => {
          setImportOpen(false);
          toast.success("Extrato importado");
          if (imported.id !== debt.id)
            void navigate({ to: "/debts/$debtId", params: { debtId: imported.id } });
        }}
        onOpenChange={setImportOpen}
        open={importOpen}
      />
      <DebtRenameDialog
        debtId={debt.id}
        name={debt.name}
        onOpenChange={setRenameOpen}
        open={renameOpen}
      />
      <AlertDialog onOpenChange={setRemoveOpen} open={removeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir dívida?</AlertDialogTitle>
            <AlertDialogDescription>
              “{debt.name}” e os extratos importados serão excluídos. Para voltar a acompanhá-la,
              importe o extrato de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => void remove()}
              variant="destructive"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Jumps between debts; hidden while there is only one. */
function DebtSwitcher({ currentId }: { currentId: string }) {
  const debtsQuery = useQuery(debtsQueryOptions());
  const navigate = useNavigate();
  const others = (debtsQuery.data ?? []).filter((item) => item.id !== currentId);
  if (others.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" />}>
        <ChevronsUpDown aria-hidden="true" className="size-4" /> Trocar dívida
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {others.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => void navigate({ to: "/debts/$debtId", params: { debtId: item.id } })}
          >
            {item.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DebtNotFound() {
  const navigate = useNavigate();
  return (
    <section className="app-page project-container">
      <Card className="grid min-h-60 place-items-center border p-6 text-center">
        <div className="max-w-md">
          <p className="font-medium">Dívida não encontrada</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Ela pode ter sido excluída. Volte para a lista de dívidas.
          </p>
          <Button
            className="mt-4"
            onClick={() => void navigate({ to: "/debts" })}
            size="sm"
            type="button"
            variant="outline"
          >
            Ver dívidas
          </Button>
        </div>
      </Card>
    </section>
  );
}

function DebtDetailSkeleton() {
  return (
    <div aria-label="Carregando dívida" className="grid gap-6" role="status">
      <Skeleton className="h-16" />
      <Skeleton className="h-96" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
