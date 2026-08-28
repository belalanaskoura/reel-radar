import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminSectionSkeleton } from '@/components/Skeleton';

export default function AdminUsageLoading() {
  return (
    <AdminPageShell title="Usage">
      <AdminSectionSkeleton rows={1} />
      <AdminSectionSkeleton rows={4} />
    </AdminPageShell>
  );
}
