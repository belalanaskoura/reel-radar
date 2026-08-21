import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { BroadcastForm } from '@/components/admin/BroadcastForm';

export default async function AdminBroadcastPage() {
  const supabase = createServiceRoleClient();
  const { data: usersPage } = await supabase.auth.admin.listUsers();
  const users = (usersPage?.users ?? [])
    .flatMap((u) => (u.email ? [{ id: u.id, email: u.email }] : []))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <AdminPageShell title="Broadcast">
      <section>
        <p className="mb-6 text-sm" style={{ color: 'var(--ink-dim)' }}>
          Send a one-off message to every signed-up user, or to specific
          people, by email and push (for whoever&rsquo;s subscribed). Edit the
          subject/message below before sending — there&rsquo;s no undo once it
          goes out.
        </p>
        <BroadcastForm users={users} />
      </section>
    </AdminPageShell>
  );
}
