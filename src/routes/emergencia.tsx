import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/emergencia")({
  staticData: { sitemap: false },
  component: EmergencyLayout,
});

function EmergencyLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/emergencia" className="font-display text-lg font-bold">Better <span className="text-primary">Mangá</span></Link>
        </div>
      </header>
      <div role="status" className="border-b border-border bg-surface-2">
        <p className="mx-auto max-w-6xl px-4 py-2 text-sm text-muted-foreground">
          <b className="text-foreground">Modo de emergência:</b> favoritos, histórico, comentários e login voltam quando o sistema normalizar.
        </p>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
