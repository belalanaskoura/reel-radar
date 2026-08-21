import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { BroadcastForm } from '@/components/admin/BroadcastForm';

export default async function AdminBroadcastPage() {
  const supabase = createServiceRoleClient();
  const { data: usersPage } = await supabase.auth.admin.listUsers();
  const recipientCount = (usersPage?.users ?? []).filter((u) => !!u.email).length;

  return (
    <AdminPageShell title="Broadcast">
      <section>
        <p className="mb-6 text-sm" style={{ color: 'var(--ink-dim)' }}>
          Send a one-off message to every signed-up user, by email and push
          (for whoever&rsquo;s subscribed). Edit the subject/message below before
          sending — there&rsquo;s no undo once it goes out.
        </p>
        <BroadcastForm recipientCount={recipientCount} />
      </section>
    </AdminPageShell>
  );
}
