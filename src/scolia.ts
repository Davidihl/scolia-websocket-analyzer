// Typed access to the parts of Scolia's messages we use. Payloads come from the
// page and are untrusted, so every reader checks shapes instead of casting blindly.
// See readme.md for the message structure.

import type { Leg } from "./api";

export type GameConfig = {
  scoreType: string;
  sets: number;
  legs: number;
  startScore: number;
  gameInType: string;
  gameOutType: string;
};

type LegStats = {
  statistics: { throwCount: number };
  remainingScores: number[];
};

export type ScoliaGame = {
  gameId: string;
  status: string;
  startTime?: string;
  netDuration?: number;
  participants?: { _id: string; nickname: string }[];
  configuration: GameConfig & {
    playerNames?: Record<string, string>;
    playerTypes?: Record<string, string>;
  };
  statistics: {
    userId: string;
    sets: { legs: LegStats[] }[];
  }[];
  winnerIds?: string[];
};

/** A Scolia player: `id` keys the statistics, `name` is null when we only have a placeholder. */
export type ScoliaPlayer = { id: string; name: string | null };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isConfig = (value: unknown): value is GameConfig =>
  isObject(value) &&
  typeof value["startScore"] === "number" &&
  typeof value["legs"] === "number" &&
  typeof value["gameOutType"] === "string";

/** `payload.game` of GAME_ENDED_STATISTICS, or null if it doesn't look like one. */
export const readEndedGame = (payload: unknown): ScoliaGame | null => {
  if (!isObject(payload) || !isObject(payload["game"])) return null;
  const game = payload["game"];
  if (
    typeof game["gameId"] !== "string" ||
    typeof game["status"] !== "string" ||
    !isConfig(game["configuration"]) ||
    !Array.isArray(game["statistics"])
  ) {
    return null;
  }
  return game as unknown as ScoliaGame;
};

/** Config and per-ID nicknames from either start snapshot (X01 or bull-off). */
export const readStartSnapshot = (
  payload: unknown,
): { config: GameConfig; nicknames: Map<string, string> } | null => {
  if (!isObject(payload)) return null;

  let config: unknown;
  let players: unknown;
  if (isObject(payload["state"])) {
    // API::GAME::GAME_CURRENT_STATE
    config = payload["state"]["configuration"];
    players = isObject(payload["state"]["game"]) ? payload["state"]["game"]["players"] : undefined;
  } else if (isObject(payload["gameState"])) {
    // API::BULL_THROW::GAME_CURRENT_STATE: the X01 config waits under nextGame.
    const gameState = payload["gameState"];
    const nextGame = isObject(gameState["configuration"])
      ? gameState["configuration"]["nextGame"]
      : undefined;
    config = isObject(nextGame) ? nextGame["configuration"] : undefined;
    players = gameState["players"];
  }
  if (!isConfig(config)) return null;

  const nicknames = new Map<string, string>();
  if (isObject(players)) {
    for (const [id, player] of Object.entries(players)) {
      if (isObject(player) && typeof player["nickname"] === "string") {
        nicknames.set(id, player["nickname"]);
      }
    }
  }
  return { config, nicknames };
};

export const readAborted = (payload: unknown) =>
  isObject(payload) && payload["isAborted"] === true;

// Guests without a typed name show up as "Player 1", users as their 24-hex ID.
const isPlaceholderName = (name: string) =>
  /^Player \d+$/.test(name) || /^[0-9a-f]{24}$/i.test(name);

/**
 * Both players in Scolia's player order. Names come from `participants` (registered
 * users), then from nicknames seen in the start snapshot, then from the ID itself.
 */
export const getPlayers = (
  game: ScoliaGame,
  startNicknames: Map<string, string> = new Map(),
): ScoliaPlayer[] => {
  const playerNames = game.configuration.playerNames ?? {};
  const orderedIds = Object.keys(playerNames)
    .sort()
    .map((key) => playerNames[key])
    .filter((id): id is string => !!id);
  const ids = orderedIds.length > 0 ? orderedIds : game.statistics.map((s) => s.userId);

  return ids.map((id) => {
    const candidates = [
      game.participants?.find((p) => p._id === id)?.nickname,
      startNicknames.get(id),
      id,
    ];
    const name = candidates.find((c) => !!c && !isPlaceholderName(c));
    return { id, name: name ?? null };
  });
};

const legsOf = (game: ScoliaGame, playerId: string) =>
  game.statistics.find((s) => s.userId === playerId)?.sets.flatMap((set) => set.legs) ?? [];

/** Remaining score and darts per leg for one Scolia player, numbered across sets. */
export const playerLegs = (game: ScoliaGame, playerId: string) =>
  legsOf(game, playerId).map((leg) => ({
    remaining: leg.remainingScores.at(-1) ?? game.configuration.startScore,
    darts: leg.statistics.throwCount,
  }));

/** Fewest darts that can score `points` (60 per dart), as fusion-local's isValidLeg checks. */
export const minDarts = (points: number) => Math.ceil(points / 60);

export const legsWon = (game: ScoliaGame, playerId: string) =>
  legsOf(game, playerId).filter((leg) => leg.remainingScores.at(-1) === 0).length;

/** Sides as chosen in the modal: which Scolia player is matchup player1 / player2. */
export type Sides = { player1: string; player2: string };

/** One leg per Scolia leg, numbered across sets. Darts include filler darts (see readme). */
export const buildLegs = (game: ScoliaGame, sides: Sides): Leg[] => {
  const legs1 = legsOf(game, sides.player1);
  const legs2 = legsOf(game, sides.player2);
  const count = Math.max(legs1.length, legs2.length);
  const startScore = game.configuration.startScore;

  return Array.from({ length: count }, (_, index) => {
    const leg1 = legs1[index];
    const leg2 = legs2[index];
    return {
      legNumber: index + 1,
      player1Remaining: leg1?.remainingScores.at(-1) ?? startScore,
      player2Remaining: leg2?.remainingScores.at(-1) ?? startScore,
      player1Darts: leg1?.statistics.throwCount ?? null,
      player2Darts: leg2?.statistics.throwCount ?? null,
    };
  });
};

/** End of the game: start plus net duration, falling back to now. */
export const getPlayedAt = (game: ScoliaGame, now = new Date()) => {
  const start = game.startTime ? Date.parse(game.startTime) : NaN;
  if (Number.isNaN(start)) return now.toISOString();
  return new Date(start + (game.netDuration ?? 0)).toISOString();
};
