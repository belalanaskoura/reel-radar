// Shared safety net for the one-off scripts in this directory -- every one
// of them runs against the real production database with the service-role
// key (they parse .env.local directly, bypassing RLS entirely) and several
// of them delete or merge rows. Before this, `npx tsx scripts/whatever.ts`
// against the wrong environment, or a script re-run after the bug it was
// written for had already been fixed elsewhere, was unrecoverable with no
// warning at all.
//
// Dry-run is now the default for every script that imports this: it prints
// what it *would* do and performs zero writes unless invoked with --live.
// A script opts in by checking isDryRun() immediately before each write
// call site (see cleanup-distributor-filter.ts for the pattern) rather than
// this module trying to intercept the Supabase client generically, since
// the actual write shapes (delete/update/upsert, single vs. batched) differ
// enough per script that a generic wrapper would obscure more than it saves.
export function isDryRun(): boolean {
  return !process.argv.includes('--live');
}

export function logDryRunBanner(scriptName: string): void {
  if (isDryRun()) {
    console.log(
      `[dry run] ${scriptName}: no writes will be made. Re-run with --live to actually apply changes.\n`,
    );
  } else {
    console.log(`[LIVE] ${scriptName}: writes are enabled. This will modify production data.\n`);
  }
}
