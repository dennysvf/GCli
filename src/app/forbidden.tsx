import Link from "next/link";
import { Button } from "@/shared/ui/components/button";

// 403 page rendered by forbidden() (PRD F01 Experience).
export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground column-label">Erro 403</p>
      <h1 className="section-title">Você não tem permissão para acessar esta página</h1>
      <Button asChild variant="outline">
        <Link href="/">Voltar para o início</Link>
      </Button>
    </main>
  );
}
