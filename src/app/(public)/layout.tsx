import { Card, CardContent } from "@/shared/ui/components/card";

// Centered card used by sign-in and account recovery pages.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="bg-muted/40 flex flex-1 items-center justify-center p-4">
      <div className="grid w-full max-w-sm gap-6">
        <p className="text-center text-2xl font-semibold tracking-tight">GCli</p>
        <Card>
          <CardContent className="grid gap-6">{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
