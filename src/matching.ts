// Guesses which open matchup a Scolia game belongs to by comparing Scolia names
// with fusion-local aliases. It's only a suggestion: the user always confirms.

import type { Matchup, Season } from "./api";
import type { ScoliaPlayer, Sides } from "./scolia";

export const MATCH_THRESHOLD = 0.75;
export const MATCH_MARGIN = 0.1;

const normalize = (name: string) => {
  const tokens = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return { tokens, full: tokens.join(" ") };
};

const levenshtein = (a: string, b: string) => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
};

const tokenSimilarity = (a: string, b: string) =>
  1 - levenshtein(a, b) / Math.max(a.length, b.length);

/** How likely a Scolia name and a fusion-local alias refer to the same person, 0..1. */
export const similarity = (scoliaName: string | null, alias: string | null) => {
  if (!scoliaName || !alias) return 0;
  const a = normalize(scoliaName);
  const b = normalize(alias);
  if (!a.full || !b.full) return 0;
  if (a.full === b.full) return 1;

  const contains = (outer: string[], inner: string[]) =>
    inner.every((token) => outer.includes(token));
  if (contains(a.tokens, b.tokens) || contains(b.tokens, a.tokens)) return 0.9;

  const [shorter, longer] = a.full.length <= b.full.length ? [a.full, b.full] : [b.full, a.full];
  if (shorter.length >= 4 && longer.includes(shorter)) return 0.8;

  let best = 0;
  for (const tokenA of a.tokens) {
    for (const tokenB of b.tokens) best = Math.max(best, tokenSimilarity(tokenA, tokenB));
  }
  return best >= MATCH_THRESHOLD ? best : 0;
};

export type RankedMatchup = {
  season: Season;
  matchup: Matchup;
  /** The weaker of the two player matches: both players have to match. */
  score: number;
  sides: Sides;
  pairs: { scoliaName: string | null; alias: string | null; score: number }[];
};

export type Suggestion = { ranked: RankedMatchup[]; best: RankedMatchup | null };

const rankMatchup = (
  season: Season,
  matchup: Matchup,
  [first, second]: [ScoliaPlayer, ScoliaPlayer],
): RankedMatchup => {
  const orientations = [
    { player1: first, player2: second },
    { player1: second, player2: first },
  ].map(({ player1, player2 }) => {
    const pairs = [
      { scoliaName: player1.name, alias: matchup.player1.alias },
      { scoliaName: player2.name, alias: matchup.player2.alias },
    ].map((pair) => ({ ...pair, score: similarity(pair.scoliaName, pair.alias) }));
    return {
      season,
      matchup,
      score: Math.min(...pairs.map((pair) => pair.score)),
      sides: { player1: player1.id, player2: player2.id },
      pairs,
    };
  });
  // Prefer Scolia's own order when nothing matches either way.
  return orientations[1]!.score > orientations[0]!.score ? orientations[1]! : orientations[0]!;
};

export const suggestMatchup = (
  players: ScoliaPlayer[],
  options: { season: Season; matchups: Matchup[] }[],
): Suggestion => {
  const [first, second] = players;
  if (!first || !second) return { ranked: [], best: null };

  const ranked = options
    .flatMap(({ season, matchups }) =>
      matchups.map((matchup) => rankMatchup(season, matchup, [first, second])),
    )
    .sort((a, b) => b.score - a.score);

  const [top, runnerUp] = ranked;
  const best =
    top && top.score >= MATCH_THRESHOLD && top.score - (runnerUp?.score ?? 0) >= MATCH_MARGIN
      ? top
      : null;
  return { ranked, best };
};
