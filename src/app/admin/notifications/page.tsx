import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { SuccessFailBarChart, type DayCounts } from '@/components/admin/SuccessFailBarChart';

export default async function AdminNotificationsPage() {
  const supabase = createServiceRoleClient();
  const fourteenDaysAgo = new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: recentDeliveries }, { data: failures }] = await Promise.all([
    supabase
      .from('notification_deliveries')
      .select('created_at, success')
      .gte('created_at', fourteenDaysAgo),
    supabase
      .from('notification_deliveries')
      .select('created_at, channel, error, user_id, movie_id, profiles(email), movies(title)')
      .eq('success', false)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const dayBuckets = new Map<string, { success: number; fail: number }>();
  for (const row of recentDeliveries ?? []) {
    const label = new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const bucket = dayBuckets.get(label) ?? { success: 0, fail: 0 };
    if (row.success) bucket.success += 1;
    else bucket.fail += 1;
    dayBuckets.set(label, bucket);
  }
  const days: DayCounts[] = [...dayBuckets.entries()]
    .slice(-14)
    .map(([label, counts]) => ({ label, ...counts }));

  return (
    <AdminPageShell title="Notifications">
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Delivery success/fail, last 14 days
        </h2>
        {days.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No deliveries logged yet.
          </p>
        ) : (
          <SuccessFailBarChart days={days} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--ink-dim)' }}>
          Recent failures
        </h2>
        {!failures || failures.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No recent delivery failures.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border" style={{ borderColor: 'var(--rule)' }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--ink-dim)' }}>
                  <Th>When</Th>
                  <Th>Channel</Th>
                  <Th>User</Th>
                  <Th>Movie</Th>
                  <Th>Error</Th>
                </tr>
              </thead>
              <tbody>
                {failures.map((row, i) => {
                  const profile = row.profiles as unknown as { email: string | null } | null;
                  const movie = row.movies as unknown as { title: string } | null;
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--rule)' }}>
                      <Td>{timeAgo(row.created_at)}</Td>
                      <Td>{row.channel}</Td>
                      <Td>{profile?.email ?? row.user_id}</Td>
                      <Td>{movie?.title ?? row.movie_id}</Td>
                      <Td>
                        <span style={{ color: 'var(--error-ink)' }}>{row.error?.slice(0, 80) ?? 'unknown'}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-xs font-semibold tracking-wide uppercase">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink)' }}>
      {children}
    </td>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((new Date().getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
