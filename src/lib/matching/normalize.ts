// Strips Scene's format/language suffixes so titles compare cleanly across
// branches and against TMDB, which has none of this metadata in its titles.
// e.g. "Spider-Man: Brand New Day  (2D)" -> "spider-man: brand new day"
//      "Toy Story 5 DUB" -> "toy story 5"
//      "Moana (3D)" -> "moana"
export function normalizeTitle(title: string): string {
  return title
    .replace(/\s*\((2D|3D|4DX|IMAX|VIP)\)\s*/gi, ' ')
    .replace(/\b(2D|3D|4DX|IMAX)\b/gi, ' ')
    .replace(/\bDUB(BING)?\b/gi, ' ')
    .replace(/\b(ARABIC|ENGLISH)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
