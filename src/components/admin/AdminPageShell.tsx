import { AdminTabStrip } from '@/components/AdminTabStrip';

export function AdminPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-3.5 py-6 sm:px-6 sm:py-10">
      <h1 className="font-display mb-4 text-2xl tracking-wide uppercase sm:mb-5 sm:text-4xl" style={{ color: 'var(--ink)' }}>
        {title}
      </h1>
      <div className="mb-6 border-b pb-4 sm:mb-8 sm:pb-5" style={{ borderColor: 'var(--rule)' }}>
        <AdminTabStrip />
      </div>
      <div className="flex flex-col gap-8 sm:gap-10">{children}</div>
    </main>
  );
}
