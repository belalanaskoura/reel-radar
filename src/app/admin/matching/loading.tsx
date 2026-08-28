import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminSectionSkeleton } from '@/components/Skeleton';

export default function AdminMatchingLoading() {
  return (
    <AdminPageShell title="Matching">
      <AdminSectionSkeleton rows={1} />
      <AdminSectionSkeleton rows={5} />
    </AdminPageShell>
  );
}
