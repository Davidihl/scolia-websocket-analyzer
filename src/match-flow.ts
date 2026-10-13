// Turns Scolia events into one reported result per finished game. No DOM or
// chrome APIs here: the UI, API and pending-result storage are injected.

import type { Matchup, PendingResult, ResultBody, Season, SubmitOutcome } from "./api";
import { suggestMatchup, type Suggestion } from "./matching";
import type { ScoliaMessage } from "./protocol";
import {
  buildLegs,
  getPlayedAt,
  getPlayers,
  legsWon,
  playerLegs,
  readAborted,
  readEndedGame,
  readStartSnapshot,
  type GameConfig,
  type ScoliaGame,
  type ScoliaPlayer,
  type Sides,
} from "./scolia";

export type ConfirmRequest = {
  game: ScoliaGame;
  players: ScoliaPlayer[];
  /** Legs won per Scolia player ID, for showing the score. */
  score: Record<string, number>;
  /** Per Scolia player ID: remaining score and darts of each leg, as Scolia reported them. */
  legs: Record<string, { remaining: number; darts: number }[]>;
  options: { season: Season; matchups: Matchup[] }[];
  suggestion: Suggestion;
};

export type Confirmation = {
  matchupId: string;
  sides: Sides;
  /** Dart counts per Scolia player ID and leg index, when the user edited them. */
  darts?: Record<string, number[]>;
};

/** The request body for a confirmed result, applying any dart counts edited in the dialog. */
export const buildResultBody = (
  gameId: string,
  game: ScoliaGame,
  { sides, darts }: Confirmation,
): ResultBody => {
  let edited = false;
  const legs = buildLegs(game, sides).map((leg, index) => {
    const player1Darts = darts?.[sides.player1]?.[index] ?? leg.player1Darts;
    const player2Darts = darts?.[sides.player2]?.[index] ?? leg.player2Darts;
    if (player1Darts !== leg.player1Darts || player2Darts !== leg.player2Darts) edited = true;
    return { ...leg, player1Darts, player2Darts };
  });
  return { playedAt: getPlayedAt(game), legs, source: { system: "scolia", gameId, edited } };
};

export type MatchFlowUi = {
  /**
   * Resolves with the chosen matchup, "discard" to drop the result, or "later" to keep
   * it pending (it's offered again on the next page load).
   */
  confirmResult(request: ConfirmRequest): Promise<Confirmation | "discard" | "later">;
  warnConfig(message: string): void;
  notify(kind: "success" | "error", message: string, retry?: () => void): void;
};

export type MatchFlowApi = {
  seasons(): Promise<Season[]>;
  matchups(seasonId: string): Promise<Matchup[]>;
  submit(matchupId: string, body: ResultBody): Promise<SubmitOutcome>;
};

export type PendingStore = {
  get(): Promise<PendingResult | null>;
  set(pending: PendingResult): Promise<void>;
  clear(gameId: string): Promise<void>;
};

const legsToWin = (season: Season) => (season.bestOf + 1) / 2;

/** Differences between Scolia's game setup and a season's rules, empty when they match. */
export const configMismatches = (config: GameConfig, season: Season) => {
  const problems: string[] = [];
  if (config.startScore !== season.mode) {
    problems.push(`start score ${config.startScore} instead of ${season.mode}`);
  }
  if (season.checkOut && config.gameOutType.toLowerCase() !== season.checkOut.toLowerCase()) {
    problems.push(`${config.gameOutType} out instead of ${season.checkOut} out`);
  }
  if (season.checkIn && config.gameInType.toLowerCase() !== season.checkIn.toLowerCase()) {
    problems.push(`${config.gameInType} in instead of ${season.checkIn} in`);
  }
  const raceTo = config.scoreType === "BestOf" ? (config.legs + 1) / 2 : config.legs;
  if (config.sets !== 1 || raceTo !== legsToWin(season)) {
    problems.push(`race to ${raceTo} legs instead of ${legsToWin(season)} (best of ${season.bestOf})`);
  }
  return problems;
};

export const createMatchFlow = ({
  ui,
  api,
  pending,
}: {
  ui: MatchFlowUi;
  api: MatchFlowApi;
  pending: PendingStore;
}) => {
  let startChecked = false;
  let startNicknames = new Map<string, string>();
  const seenGameIds = new Set<string>();
  // Results are confirmed one at a time, in arrival order.
  let queue = Promise.resolve();

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch((error: unknown) => {
      ui.notify("error", error instanceof Error ? error.message : String(error));
    });
    return queue;
  };

  const checkStart = async (config: GameConfig) => {
    const seasons = await api.seasons();
    if (seasons.length === 0) {
      ui.warnConfig("There is no running darts season to report this game to.");
      return;
    }
    const perSeason = seasons.map((season) => ({
      season,
      problems: configMismatches(config, season),
    }));
    if (perSeason.some(({ problems }) => problems.length === 0)) return;
    const [first] = perSeason;
    ui.warnConfig(
      `This game doesn't match “${first!.season.name}”: ${first!.problems.join(", ")}.`,
    );
  };

  const loadOptions = async () => {
    const seasons = await api.seasons();
    return Promise.all(
      seasons.map(async (season) => ({ season, matchups: await api.matchups(season.id) })),
    );
  };

  const submit = async (result: PendingResult, confirmation: Confirmation) => {
    const { gameId, game } = result;
    const body = buildResultBody(gameId, game, confirmation);
    try {
      const outcome = await api.submit(confirmation.matchupId, body);
      await pending.clear(gameId);
      ui.notify(
        "success",
        outcome.alreadyRecorded ? "This matchup already has a result." : "Result sent.",
      );
    } catch (error) {
      ui.notify(
        "error",
        `Sending the result failed: ${error instanceof Error ? error.message : String(error)}`,
        () => void enqueue(() => submit(result, confirmation)),
      );
    }
  };

  const confirmAndSubmit = async (result: PendingResult) => {
    const players = getPlayers(result.game, new Map(result.startNicknames));
    let options;
    try {
      options = await loadOptions();
    } catch (error) {
      ui.notify(
        "error",
        `Loading matchups failed: ${error instanceof Error ? error.message : String(error)}`,
        () => void enqueue(() => confirmAndSubmit(result)),
      );
      return;
    }

    const confirmation = await ui.confirmResult({
      game: result.game,
      players,
      score: Object.fromEntries(players.map((p) => [p.id, legsWon(result.game, p.id)])),
      legs: Object.fromEntries(players.map((p) => [p.id, playerLegs(result.game, p.id)])),
      options,
      suggestion: suggestMatchup(players, options),
    });
    if (confirmation === "later") return;
    if (confirmation === "discard") {
      await pending.clear(result.gameId);
      return;
    }
    await submit(result, confirmation);
  };

  const onGameEnded = async (game: ScoliaGame) => {
    // Unfinished (e.g. aborted) games aren't reported.
    if (game.status !== "Finished" || seenGameIds.has(game.gameId)) return;
    seenGameIds.add(game.gameId);

    const result: PendingResult = {
      gameId: game.gameId,
      game,
      startNicknames: [...startNicknames],
    };
    startChecked = false;
    startNicknames = new Map();
    // Persist first, so a reload before confirming offers the result again.
    await pending.set(result).catch(() => {
      // Without storage the result can still be confirmed right away.
    });
    await enqueue(() => confirmAndSubmit(result));
  };

  return {
    async handle(message: ScoliaMessage) {
      switch (message.type) {
        case "API::BULL_THROW::GAME_CURRENT_STATE":
        case "API::GAME::GAME_CURRENT_STATE": {
          const snapshot = readStartSnapshot(message.payload);
          if (!snapshot) return;
          for (const [id, nickname] of snapshot.nicknames) startNicknames.set(id, nickname);
          if (startChecked) return;
          startChecked = true;
          void checkStart(snapshot.config).catch(() => {
            // The start check is only a hint; errors surface when reporting.
          });
          return;
        }
        case "API::X01::GAME_DELETED":
          if (readAborted(message.payload)) {
            startChecked = false;
            startNicknames = new Map();
          }
          return;
        case "API::GAME::GAME_ENDED_STATISTICS": {
          const game = readEndedGame(message.payload);
          if (game) await onGameEnded(game);
          return;
        }
      }
    },

    /** Offers a result that was left unconfirmed before the last reload. */
    async resumePending() {
      const result = await pending.get();
      if (!result || seenGameIds.has(result.gameId)) return;
      seenGameIds.add(result.gameId);
      await enqueue(() => confirmAndSubmit(result));
    },

    /** Resolves once all queued confirmations and submissions are done (for tests). */
    idle: () => queue,
  };
};
