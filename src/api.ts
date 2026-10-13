// Shapes of the fusion-local Darts API (see docs/api.md) and the message protocol
// between content scripts / options page and the service worker.

import type { ScoliaGame } from "./scolia";

export type Season = {
  id: string;
  shortId: string;
  name: string;
  mode: number;
  bestOf: number;
  checkIn: string | null;
  checkOut: string | null;
  startDate: string | null;
};

export type MatchupPlayer = { id: string; alias: string | null };

export type Matchup = {
  id: string;
  shortId: string;
  roundNumber: number;
  player1: MatchupPlayer;
  player2: MatchupPlayer;
};

export type Leg = {
  legNumber: number;
  player1Remaining: number;
  player2Remaining: number;
  player1Darts: number | null;
  player2Darts: number | null;
};

export type ResultBody = {
  playedAt: string;
  legs: Leg[];
  /** `edited` marks dart counts changed by hand in the confirm dialog. */
  source: { system: "scolia"; gameId: string; edited: boolean };
};

export type SubmitOutcome = { alreadyRecorded: boolean };

export type PendingResult = { gameId: string; game: ScoliaGame; startNicknames: [string, string][] };

export type BackgroundRequest =
  | { kind: "seasons" }
  | { kind: "matchups"; seasonId: string }
  | { kind: "submit"; matchupId: string; body: ResultBody }
  | { kind: "pending:get" }
  | { kind: "pending:set"; pending: PendingResult }
  | { kind: "pending:clear"; gameId: string };

export type BackgroundResponseData = {
  seasons: Season[];
  matchups: Matchup[];
  submit: SubmitOutcome;
  "pending:get": PendingResult | null;
  "pending:set": null;
  "pending:clear": null;
};

export type BackgroundResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Sends a request to the service worker and throws its error message on failure. */
export const callBackground = async <K extends BackgroundRequest["kind"]>(
  request: Extract<BackgroundRequest, { kind: K }>,
): Promise<BackgroundResponseData[K]> => {
  const result = (await chrome.runtime.sendMessage(request)) as
    | BackgroundResult<BackgroundResponseData[K]>
    | undefined;
  if (!result) throw new Error("No response from the extension background");
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
