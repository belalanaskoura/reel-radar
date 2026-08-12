// Strips Scene's format/language suffixes so titles compare cleanly across
// branches and against TMDB, which has none of this metadata in its titles.
// e.g. "Spider-Man: Brand New Day  (2D)" -> "spider-man: brand new day"
//      "Toy Story 5 DUB" -> "toy story 5"
//      "Moana (3D)" -> "moana"
//      "Above and Below" -> "above and below" (matches TMDB's own
//        "Above & Below" after the & -> and step below)
//
// "&" -> "and" specifically (not the reverse) because Scene/elCinema
// titles use plain "and" far more often than "&", so normalizing toward
// "and" touches fewer real titles. Confirmed necessary for real: Scene
// listed "Above and Below" while the actual 2026 movie's TMDB title is
// "Above & Below" -- without this, the two never compare equal, and the
// unnormalized "and" title's own TMDB search then risks exact-matching a
// same-named-but-different movie instead (a 2015 documentary, in this
// case) rather than staying correctly unresolved.
export function normalizeTitle(title: string): string {
  return title
    .replace(/\s*\((2D|3D|4DX|IMAX|VIP)\)\s*/gi, ' ')
    .replace(/\b(2D|3D|4DX|IMAX)\b/gi, ' ')
    .replace(/\bDUB(BING)?\b/gi, ' ')
    .replace(/\b(ARABIC|ENGLISH)\b/gi, ' ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
