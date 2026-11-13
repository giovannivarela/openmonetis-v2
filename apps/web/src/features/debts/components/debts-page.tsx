import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Banknote, Plus, RefreshCw, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Navbar } from "@/components/navigation/navbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { debtsQueryOptions } from "../debts.queries";
import { DebtCard } from "./debt-card";
import { DebtImportDialog } from "./debt-import-dialog";

export function DebtsPage() {
  const debtsQuery = useQuery(debtsQueryOptions());
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const debts = debtsQuery.data ?? [];

  return (
    <ProtectedRoute>
      <main className="min-h-svh bg-background">
        <Navbar />
        <section className="app-page project-container">
          <PageHeader
            actions={
              <Button onClick={() => setImportOpen(true)} type="button">
                <Upload aria-hidden="true" className="size-4" /> Importar extrato
              </Button>
            }
            breadcrumbs={[
              { label: "Visão geral", href: "/dashboard" },
              { label: "Finanças" },
              { label: "Dívidas" },
            ]}
            description="Financiamentos lidos do extrato do banco: saldo, parcelas e o efeito das amortizações extras."
            icon={<Banknote aria-hidden="true" className="size-5" />}
            title="Dívidas"
          />

          {debtsQuery.isLoading ? (
            <div
              aria-label="Carregando dívidas"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              role="status"
            >
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          ) : null}

          {debtsQuery.isError ? (
            <Card className="grid min-h-52 place-items-center border p-6 text-center">
              <div>
                <p className="font-medium">Não foi possível carregar as dívidas</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Verifique sua conexão e tente novamente.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => void debtsQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw aria-hidden="true" /> Tentar novamente
                </Button>
              </div>
            </Card>
          ) : null}

          {debtsQuery.isSuccess && debts.length > 0 ? (
            <section
              aria-label="Lista de dívidas"
              className="stagger-children grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {debts.map((debt) => (
                <DebtCard debt={debt} key={debt.id} />
              ))}
              <button
                className="grid min-h-48 place-items-center rounded-xl border border-border border-dashed p-6 text-center text-muted-foreground text-sm transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => setImportOpen(true)}
                type="button"
              >
                <span className="grid justify-items-center gap-2">
                  <Plus aria-hidden="true" className="size-5" />
                  <span className="font-medium text-foreground">Importar outro financiamento</span>
                  <span>Envie o PDF do demonstrativo do banco</span>
                </span>
              </button>
            </section>
          ) : null}

          {debtsQuery.isSuccess && debts.length === 0 ? (
            <Card className="grid min-h-60 place-items-center border p-6 text-center">
              <div className="max-w-md">
                <span className="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Banknote aria-hidden="true" className="size-5" />
                </span>
                <p className="mt-4 font-medium">Nenhuma dívida importada</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Importe o PDF do demonstrativo do financiamento para ver saldo, parcelas e o
                  efeito das amortizações extras.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setImportOpen(true)}
                  size="sm"
                  type="button"
                >
                  <Upload aria-hidden="true" /> Importar extrato
                </Button>
              </div>
            </Card>
          ) : null}
        </section>
        <DebtImportDialog
          onImported={(debt) => {
            setImportOpen(false);
            toast.success("Extrato importado");
            void navigate({ to: "/debts/$debtId", params: { debtId: debt.id } });
          }}
          onOpenChange={setImportOpen}
          open={importOpen}
        />
      </main>
    </ProtectedRoute>
  );
}
