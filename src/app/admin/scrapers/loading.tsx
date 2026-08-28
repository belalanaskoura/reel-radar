import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminSectionSkeleton } from '@/components/Skeleton';

export default function AdminScrapersLoading() {
  return (
    <AdminPageShell title="Scrapers">
      <AdminSectionSkeleton rows={1} />
      <AdminSectionSkeleton rows={5} />
    </AdminPageShell>
  );
}
