import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminSectionSkeleton } from '@/components/Skeleton';

export default function AdminBroadcastLoading() {
  return (
    <AdminPageShell title="Broadcast">
      <AdminSectionSkeleton rows={4} />
      <AdminSectionSkeleton rows={2} />
    </AdminPageShell>
  );
}
