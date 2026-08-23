import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { listAllUsers } from '@/lib/list-all-users';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { SectionHeader } from '@/components/admin/SectionHeader';
import { StatTile } from '@/components/admin/StatTile';
import { BroadcastForm } from '@/components/admin/BroadcastForm';

export default async function AdminBroadcastPage() {
  const supabase = createServiceRoleClient();
  const [allUsers, { data: pushRows }] = await Promise.all([
    listAllUsers(supabase),
    // user_id only -- a user can have several rows (one per device), so
    // "how many people have push enabled" is the distinct user_id count,
    // not the raw row count.
    supabase.from('push_subscriptions').select('user_id'),
  ]);

  const pushEnabledUserIds = new Set((pushRows ?? []).map((r) => r.user_id));
  const users = allUsers
    .flatMap((u) => (u.email ? [{ id: u.id, email: u.email, hasPush: pushEnabledUserIds.has(u.id) }] : []))
    .sort((a, b) => a.email.localeCompare(b.email));

  const pushEnabledCount = users.filter((u) => u.hasPush).length;
  const pushRate = users.length > 0 ? Math.round((pushEnabledCount / users.length) * 100) : 0;

  return (
    <AdminPageShell title="Broadcast">
      <section>
        <SectionHeader>Push adoption</SectionHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Users" value={users.length} />
          <StatTile label="Push enabled" value={pushEnabledCount} tone={pushEnabledCount > 0 ? 'ok' : 'neutral'} />
          <StatTile label="Adoption rate" value={`${pushRate}%`} sublabel={`${pushEnabledCount} / ${users.length}`} />
        </div>
      </section>

      <section>
        <p className="mb-6 text-sm" style={{ color: 'var(--ink-dim)' }}>
          Sends immediately once confirmed. There&rsquo;s no undo or scheduling.
        </p>
        <BroadcastForm users={users} />
      </section>
    </AdminPageShell>
  );
}
