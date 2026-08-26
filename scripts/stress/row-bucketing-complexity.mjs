// Local, synthetic stress test -- no DOM, no browser. Isolates the exact
// algorithmic shape of useEqualRowHeights' row-bucketing loop
// (src/components/useEqualRowHeights.ts:39-52): for each card, linear-scan
// every row bucket found so far to find a matching row. Simulates realistic
// grid shapes (2 to 6 columns, matching the component's own documented
// breakpoint range) to measure real op counts at increasing card counts,
// including past the current PAGE_SIZE=60 cap, to show where this would
// start to matter if that cap were ever raised. See docs/SCALABILITY_AUDIT.md
// finding 8.
//
// Run with: node scripts/stress/row-bucketing-complexity.mjs

function simulateBucketing(cardCount, columns) {
  let comparisons = 0;
  const rows = new Map();

  for (let i = 0; i < cardCount; i++) {
    const rowIndex = Math.floor(i / columns);
    const top = rowIndex * 400; // arbitrary fixed row height, doesn't affect op count

    let found = false;
    for (const [k] of rows.entries()) {
      comparisons++;
      if (Math.abs(k - top) < 2) {
        found = true;
        break;
      }
    }
    if (!found) rows.set(top, []);
  }

  return comparisons;
}

const scales = [60, 120, 250, 500, 1000, 2000];
const columnScenarios = [
  { label: '2-col (mobile)', columns: 2 },
  { label: '6-col (desktop)', columns: 6 },
];

console.log('cards | 2-col comparisons | 6-col comparisons');
console.log('------|--------------------|--------------------');
for (const n of scales) {
  const results = columnScenarios.map((s) => simulateBucketing(n, s.columns));
  console.log(`${String(n).padEnd(5)} | ${String(results[0]).padEnd(18)} | ${results[1]}`);
}
