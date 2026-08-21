import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { SectionHeader } from '@/components/admin/SectionHeader';
import { StatTile } from '@/components/admin/StatTile';
import { SuccessFailBarChart, type DayCounts } from '@/components/admin/SuccessFailBarChart';

const WINDOW_DAYS = 14;

export default async function AdminNotificationsPage() {
  const supabase = createServiceRoleClient();
  const windowStart = new Date(new Date().getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [{ data: recentDeliveries }, { data: failures }] = await Promise.all([
    supabase
      .from('notification_deliveries')
      .select('created_at, channel, success')
      .gte('created_at', windowStart.toISOString()),
    supabase
      .from('notification_deliveries')
      .select('created_at, channel, error, user_id, movie_id, profiles(email), movies(title)')
      .eq('success', false)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const deliveries = recentDeliveries ?? [];

  // Every day in the window gets a bucket, even ones with zero
  // deliveries -- the previous version only ever created a bucket for a
  // day that had at least one row, so a quiet day silently vanished from
  // the x-axis instead of showing as a real zero. That made the whole
  // window look sparser and more scattered than it actually was (most of
  // a real 14-day series here was genuinely quiet, not missing data).
  const dayBuckets = new Map<string, { success: number; fail: number }>();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dayBuckets.set(label, { success: 0, fail: 0 });
  }
  for (const row of deliveries) {
    const label = new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const bucket = dayBuckets.get(label);
    if (!bucket) continue; // outside the window's own day labels, shouldn't happen given the query's own gte filter
    if (row.success) bucket.success += 1;
    else bucket.fail += 1;
  }
  const days: DayCounts[] = [...dayBuckets.entries()].map(([label, counts]) => ({ label, ...counts }));

  const totalSent = deliveries.length;
  const totalSuccess = deliveries.filter((d) => d.success).length;
  const overallRate = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : null;

  const byChannel = (['email', 'push'] as const).map((channel) => {
    const rows = deliveries.filter((d) => d.channel === channel);
    const success = rows.filter((d) => d.success).length;
    return { channel, total: rows.length, success };
  });

  return (
    <AdminPageShell title="Notifications">
      <section>
        <SectionHeader>Last {WINDOW_DAYS} days</SectionHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total sent" value={totalSent} />
          <StatTile
            label="Overall success"
            value={overallRate === null ? '—' : `${overallRate}%`}
            tone={overallRate === null ? 'neutral' : overallRate < 90 ? 'error' : 'ok'}
            sublabel={totalSent > 0 ? `${totalSuccess} / ${totalSent}` : undefined}
          />
          {byChannel.map(({ channel, total, success }) => {
            const rate = total > 0 ? Math.round((success / total) * 100) : null;
            return (
              <StatTile
                key={channel}
                label={channel === 'email' ? 'Email success' : 'Push success'}
                value={rate === null ? 'No sends' : `${rate}%`}
                tone={rate === null ? 'neutral' : rate < 90 ? 'error' : 'ok'}
                sublabel={total > 0 ? `${success} / ${total}` : undefined}
              />
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeader>Daily delivery</SectionHeader>
        {totalSent === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No deliveries logged yet.
          </p>
        ) : (
          <SuccessFailBarChart days={days} />
        )}
      </section>

      <section>
        <SectionHeader>Recent failures</SectionHeader>
        {!failures || failures.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-dim)' }}>
            No recent delivery failures.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
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
                    <tr key={i} className="admin-table-row rounded-md transition-colors">
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
  return (
    <th
      className="border-b px-3 pb-2.5 text-xs font-semibold tracking-wide uppercase"
      style={{ borderColor: 'var(--rule)', color: 'var(--ink-dim)' }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--ink)' }}>
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
