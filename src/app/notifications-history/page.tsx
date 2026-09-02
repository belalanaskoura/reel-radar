import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BellIcon } from '@/components/icons';
import { markAsRead, markAllAsRead } from './actions';

type LogRow = {
  id: string;
  kind: 'showtime' | 'new_release' | 'lineup_added' | 'lineup_removed';
  title: string | null;
  message: string | null;
  url: string | null;
  sent_at: string;
  read_at: string | null;
};

const KIND_LABELS: Record<LogRow['kind'], string> = {
  showtime: 'Showtime',
  new_release: 'Release date',
  lineup_added: 'New at cinema',
  lineup_removed: 'Left cinema',
};

// Kinds whose url points at an internal page rather than an external
// booking link -- rendered as a Next Link instead of a plain <a target=
// "_blank">, same as new_release always has.
const INTERNAL_LINK_KINDS: LogRow['kind'][] = ['new_release', 'lineup_added', 'lineup_removed'];

export default async function NotificationsHistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

  const { data } = await supabase
    .from('notification_log')
    .select('id, kind, title, message, url, sent_at, read_at')
    .eq('user_id', user.id)
    .order('sent_at', { ascending: false })
    .limit(100);

  const notifications = (data ?? []) as LogRow[];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <main>
      <div className="relative overflow-hidden border-b" style={{ borderColor: 'var(--rule)' }}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -20%, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
          }}
        />
        <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-4xl leading-none sm:text-5xl" style={{ color: 'var(--ink)' }}>
                Notifications
              </h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--ink-dim)' }}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <form action={markAllAsRead}>
                <button
                  type="submit"
                  className="text-xs font-semibold tracking-widest uppercase underline"
                  style={{ color: 'var(--accent-dim)' }}
                >
                  Mark all read
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {notifications.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-sm border py-16 text-center"
            style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}
          >
            <BellIcon size={32} style={{ color: 'var(--ink-dim)' }} />
            <p className="mt-3 text-sm" style={{ color: 'var(--ink-dim)' }}>
              No notifications yet.
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-dim)' }}>
              Watchlist a movie to get notified when it&apos;s bookable.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function NotificationRow({ notification }: { notification: LogRow }) {
  const isUnread = !notification.read_at;
  const date = new Date(notification.sent_at);
  const dateLabel = date.toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const body = (
    <div className="min-w-0 flex-1">
      <p className="text-sm" style={{ color: 'var(--ink)' }}>
        {notification.message ?? notification.title ?? 'Notification'}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-dim)' }}>
        {KIND_LABELS[notification.kind]} &middot; {dateLabel}
      </p>
    </div>
  );

  return (
    <li
      className="flex items-start gap-3 rounded-sm border p-4"
      style={{
        borderColor: isUnread ? 'var(--accent)' : 'var(--rule)',
        background: isUnread ? 'var(--ok-bg)' : 'var(--surface)',
      }}
    >
      <div
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: isUnread ? 'var(--accent)' : 'transparent' }}
        aria-hidden="true"
      />
      {notification.url && INTERNAL_LINK_KINDS.includes(notification.kind) ? (
        <Link href={notification.url} className="min-w-0 flex-1 transition-opacity hover:opacity-80">
          {body}
        </Link>
      ) : notification.url ? (
        <a
          href={notification.url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 transition-opacity hover:opacity-80"
        >
          {body}
        </a>
      ) : (
        body
      )}
      {isUnread && (
        <form action={markAsRead.bind(null, notification.id)} className="shrink-0">
          <button
            type="submit"
            className="text-xs font-semibold tracking-wide underline"
            style={{ color: 'var(--accent-dim)' }}
          >
            Mark read
          </button>
        </form>
      )}
    </li>
  );
}
