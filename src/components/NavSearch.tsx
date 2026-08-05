'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Renders only on the browse page -- search only does something there
// (BrowseGrid reads the same ?q= param), so showing it elsewhere would
// be a dead control. Syncs to the URL rather than local state so it and
// BrowseGrid, which aren't in a direct parent/child relationship, share
// one source of truth without lifting state up through the layout.
export function NavSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (pathname !== '/') return null;

  const query = searchParams.get('q') ?? '';

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }
    // A new search always starts back at page 1 -- otherwise a query
    // typed while on page 3 of the old result set would land on page 3
    // of the new one instead.
    params.delete('page');
    router.replace(params.size > 0 ? `/?${params}` : '/', { scroll: false });
  }

  return (
    <input
      type="search"
      value={query}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Search movies..."
      aria-label="Search movies"
      className="w-full min-w-0 rounded-sm border px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2"
      style={{
        borderColor: 'var(--rule)',
        background: 'var(--bg-elevated)',
        color: 'var(--ink)',
      }}
    />
  );
}
