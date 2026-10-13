import type { Matchup, Season } from "../src/api";

export const season: Season = {
  id: "season-1",
  shortId: "s1",
  name: "Season 1",
  mode: 101,
  bestOf: 5,
  checkIn: "Straight",
  checkOut: "Double",
  startDate: "2026-10-01T00:00:00Z",
};

export const matchup = (id: string, alias1: string, alias2: string): Matchup => ({
  id,
  shortId: id,
  roundNumber: 1,
  player1: { id: `${id}-p1`, alias: alias1 },
  player2: { id: `${id}-p2`, alias: alias2 },
});
