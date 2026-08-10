import { AdminTabStrip } from '@/components/AdminTabStrip';

export function AdminPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display mb-5 text-3xl tracking-wide uppercase sm:text-4xl" style={{ color: 'var(--ink)' }}>
        {title}
      </h1>
      <div className="mb-6">
        <AdminTabStrip />
      </div>
      <div className="flex flex-col gap-8">{children}</div>
    </main>
  );
}
