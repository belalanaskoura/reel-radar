'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/scrapers', label: 'Scrapers' },
  { href: '/admin/notifications', label: 'Notifications' },
  { href: '/admin/matching', label: 'Matching' },
  { href: '/admin/usage', label: 'Usage' },
];

export function AdminTabStrip() {
  const pathname = usePathname();

  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
            style={
              isActive
                ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                : { background: 'var(--bg-elevated)', color: 'var(--ink)' }
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
