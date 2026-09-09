import type { SupabaseClient } from '@supabase/supabase-js';

// scrape-scene and poll both batch a growing dataset by ?offset= so one
// call stays under the external scheduler's 30s timeout (see each route's
// BATCH_SIZE comment) -- the external cron-job.org schedule was only ever
// configured to call offset=0 on a timer, so anything past the first batch
// silently never got auto-refreshed (confirmed for real: CFC listings
// past position 10 sat stale for days, only ever cleared by admin's
// "Re-scrape" button, which does loop every offset itself). This persists
// a resume point per key so an unattended call with no ?offset= at all
// advances through the whole dataset across successive scheduled calls,
// wrapping back to 0 once it reaches the end -- correct regardless of how
// large the dataset grows, with no cron-job.org reconfiguration needed.
// An explicit ?offset= (admin's own loop, or manual debugging) bypasses
// this entirely and must not read or write the cursor.
export async function readCursor(supabase: SupabaseClient, key: string): Promise<number> {
  const { data } = await supabase
    .from('scrape_cursors')
    .select('next_offset')
    .eq('key', key)
    .maybeSingle();
  return data?.next_offset ?? 0;
}

export async function advanceCursor(
  supabase: SupabaseClient,
  key: string,
  offset: number,
  batchLength: number,
  totalLength: number,
): Promise<void> {
  const nextOffset = offset + batchLength >= totalLength ? 0 : offset + batchLength;
  await supabase
    .from('scrape_cursors')
    .upsert({ key, next_offset: nextOffset, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}
