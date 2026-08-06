'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

// Browse search used to live in the URL (?q=), written via router.replace()
// on every keystroke. That meant every keystroke re-ran /browse's server
// component -- including its Supabase query for up to 2000 movies -- even
// though the actual filtering in BrowseGrid is a fast client-side useMemo.
// Moved to plain React state shared through context instead: NavSearch and
// BrowseGrid are siblings with no direct parent-child relationship, so this
// is how they stay in sync without a per-keystroke navigation. Trade-off,
// accepted: a search no longer survives a page refresh or is a shareable
// link, unlike before.
const SearchContext = createContext<{
  query: string;
  setQuery: (query: string) => void;
} | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>;
}

export function useSearchQuery() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearchQuery must be used within a SearchProvider');
  return ctx;
}
