import { Construction } from "lucide-react";

// Placeholder for pages delivered by later features (F06 agenda, F12 dashboard).
export function UnderConstruction({ title, feature }: { title: string; feature: string }) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
        <Construction className="size-8" aria-hidden />
        <p>Em construção.</p>
        <p className="text-xs">Esta tela será entregue na funcionalidade {feature}.</p>
      </div>
    </div>
  );
}
