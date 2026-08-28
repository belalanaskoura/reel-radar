import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminSectionSkeleton } from '@/components/Skeleton';

export default function AdminNotificationsLoading() {
  return (
    <AdminPageShell title="Notifications">
      <AdminSectionSkeleton rows={1} />
      <AdminSectionSkeleton rows={4} />
    </AdminPageShell>
  );
}
