// TMDB's reviews API has no spoiler flag at all, and reviewers don't
// follow any consistent self-tagging convention (confirmed against real
// review text: a handful say "spoiler-free" in free-form prose, most say
// nothing even when they clearly discuss plot/ending details). This is a
// keyword heuristic over the review text, not real spoiler detection --
// expect both false positives (a review that only says "no spoilers
// here" still matches) and false negatives (a spoiler that doesn't use
// any of these words slips through). Word-boundary matched so e.g.
// "endings" still matches "ending" but "pretend" doesn't match "end".
const SPOILER_KEYWORDS = [
  'spoiler',
  'spoilers',
  'spoil',
  'ending',
  'the end',
  'plot twist',
  'twist',
  'dies',
  'died',
  'death',
  'kills',
  'killed',
  'reveal',
  'revealed',
  'revelation',
  'turns out',
];

const SPOILER_PATTERN = new RegExp(
  `\\b(${SPOILER_KEYWORDS.map((k) => k.replace(/\s+/g, '\\s+')).join('|')})\\b`,
  'i',
);

export function containsSpoilers(content: string): boolean {
  return SPOILER_PATTERN.test(content);
}
