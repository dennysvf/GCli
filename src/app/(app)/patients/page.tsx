import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/modules/identity/next";
import {
  PATIENT_STATUSES,
  PATIENTS_NOT_VISIBLE,
  PatientSearchField,
  patients,
  PatientsTable,
  type PatientStatusFilter,
} from "@/modules/patients";
import { can } from "@/shared/authz/permissions";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Button } from "@/shared/ui/components/button";

export const metadata: Metadata = { title: "Pacientes" };

const PAGE_SIZE = 20;

export default async function PatientsPage({ searchParams }: PageProps<"/patients">) {
  const ctx = await requirePermission("patient:read");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : 1) || 1);
  const status: PatientStatusFilter = PATIENT_STATUSES.find((value) => value === params.status) ?? "active";
  const canManage = can(ctx, "patient:manage");
  const result = q.trim() ? await patients.searchPatients(ctx, { q, page, status, limit: PAGE_SIZE }) : null;
  const pages = result?.ok ? Math.ceil(result.value.total / PAGE_SIZE) : 0;
  const pageHref = (target: number) => {
    const next = new URLSearchParams({ q, ...(status === "active" ? {} : { status }), page: String(target) });
    return `/patients?${next.toString()}`;
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Pacientes"
        meta={result?.ok ? `${result.value.total} encontrados` : undefined}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/patients/new">
                <Plus />
                Novo paciente
              </Link>
            </Button>
          ) : null
        }
      />
      <PatientSearchField q={q} status={status} />
      {!canManage ? <p className="text-muted-foreground text-sm">{PATIENTS_NOT_VISIBLE}</p> : null}
      {result === null ? (
        <p className="text-muted-foreground">
          Busque por nome, CPF ou telefone, com pelo menos 3 caracteres.
        </p>
      ) : !result.ok ? (
        <p className="text-muted-foreground">Digite pelo menos 3 caracteres para buscar.</p>
      ) : result.value.items.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum paciente encontrado para &quot;{q.trim()}&quot;.{" "}
          {canManage ? (
            <Link href="/patients/new" className="text-primary hover:underline">
              Cadastrar paciente
            </Link>
          ) : null}
        </p>
      ) : (
        <>
          <PatientsTable items={result.value.items} />
          {pages > 1 ? (
            <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="text-primary hover:underline">
                  Anterior
                </Link>
              ) : null}
              <span className="text-muted-foreground tabular-nums">
                Página {page} de {pages}
              </span>
              {page < pages ? (
                <Link href={pageHref(page + 1)} className="text-primary hover:underline">
                  Próxima
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
