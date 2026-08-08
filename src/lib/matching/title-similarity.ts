function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Word-by-word similarity for two already-normalized titles, built to catch
// spelling-variant transliterations of the same Arabic title (e.g. "Khali
// Balak Min Nafsik" vs "Khally Balak Min Nafsak") without also matching
// genuinely different movies. Two guards make this safe as an auto-merge
// signal, not just a display heuristic:
//  - word counts must match exactly: catches "The Get Out" vs "Get Out" and
//    "Runner" vs "Runner Runner" (real elCinema search false-positives from
//    a fully different bug elsewhere -- see egypt-release-date.ts) before
//    they ever reach the per-word comparison.
//  - any word containing digits must match those digits exactly: without
//    this, plain Levenshtein similarity scores "Toy Story 5" vs "Toy Story
//    4" (0.91) and "The Odyssey" vs "The Odyssey 2" higher than the real
//    transliteration-variant pairs this function exists to catch, which
//    would make sequels the dominant false-positive risk.
// Whole-word Levenshtein similarity (not full-string) is what makes this
// tolerant of one word's spelling drifting ("Delilah" vs "Dalilah") without
// smearing that tolerance across the whole title.
export function titleSimilarity(a: string, b: string): number {
  const aWords = a.split(/\s+/).filter(Boolean);
  const bWords = b.split(/\s+/).filter(Boolean);
  if (aWords.length === 0 || aWords.length !== bWords.length) return 0;

  let total = 0;
  for (let i = 0; i < aWords.length; i++) {
    const wa = aWords[i];
    const wb = bWords[i];
    const digitsA = wa.match(/\d+/g)?.join('') ?? '';
    const digitsB = wb.match(/\d+/g)?.join('') ?? '';
    if (digitsA !== digitsB) return 0;

    const distance = levenshtein(wa, wb);
    total += 1 - distance / Math.max(wa.length, wb.length, 1);
  }
  return total / aWords.length;
}
