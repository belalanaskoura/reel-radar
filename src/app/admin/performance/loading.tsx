import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminSectionSkeleton } from '@/components/Skeleton';

export default function AdminPerformanceLoading() {
  return (
    <AdminPageShell title="Performance">
      <AdminSectionSkeleton rows={1} />
      <AdminSectionSkeleton rows={4} />
    </AdminPageShell>
  );
}
