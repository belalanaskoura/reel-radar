'use client';

import { usePathname } from 'next/navigation';
import { SearchIcon } from '@/components/icons';
import { useSearchQuery } from '@/components/SearchProvider';

// Renders only on the browse page: search only does something there
// (BrowseGrid reads the same shared query), so showing it elsewhere would
// be a dead control. Reads/writes SearchProvider's context rather than the
// URL -- it and BrowseGrid aren't in a direct parent/child relationship,
// so this is how they share one source of truth without a per-keystroke
// navigation (see SearchProvider for why the URL was dropped).
export function NavSearch() {
  const pathname = usePathname();
  const { query, setQuery } = useSearchQuery();

  if (pathname !== '/browse') return null;

  return (
    <div className="relative order-3 w-full sm:order-none sm:w-auto sm:max-w-sm sm:flex-1">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        style={{ color: 'var(--ink-dim)' }}
      />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movies..."
        aria-label="Search movies"
        className="w-full min-w-0 rounded-sm border py-1.5 pr-3 pl-8 text-sm focus:outline-none focus-visible:ring-2"
        style={{
          borderColor: 'var(--rule)',
          background: 'var(--bg-elevated)',
          color: 'var(--ink)',
        }}
      />
    </div>
  );
}
