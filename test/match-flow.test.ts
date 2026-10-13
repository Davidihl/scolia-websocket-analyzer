import assert from "node:assert/strict";
import { test } from "node:test";
import guestGame from "../demo-data/completegame.json";
import userGameEnded from "../demo-data/ended-statistics-users.json";
import type { Matchup, PendingResult, ResultBody, Season } from "../src/api";
import { buildResultBody, configMismatches, createMatchFlow, type ConfirmRequest, type MatchFlowUi } from "../src/match-flow";
import type { ScoliaMessage } from "../src/protocol";
import type { GameConfig } from "../src/scolia";
import { matchup, season } from "./fixtures";

type Choice = Awaited<ReturnType<MatchFlowUi["confirmResult"]>>;

const setup = ({
  seasons = [season],
  matchups = [] as Matchup[],
  choose = (request: ConfirmRequest): Choice =>
    request.suggestion.best
      ? { matchupId: request.suggestion.best.matchup.id, sides: request.suggestion.best.sides }
      : "discard",
  submitError = null as Error | null,
  stored = null as PendingResult | null,
} = {}) => {
  const calls = {
    confirms: [] as ConfirmRequest[],
    submits: [] as { matchupId: string; body: ResultBody }[],
    warnings: [] as string[],
    notifications: [] as { kind: string; message: string; retry?: () => void }[],
  };
  let pending = stored;
  const flow = createMatchFlow({
    ui: {
      confirmResult: async (request) => {
        calls.confirms.push(request);
        return choose(request);
      },
      warnConfig: (message) => calls.warnings.push(message),
      notify: (kind, message, retry) => calls.notifications.push({ kind, message, ...(retry ? { retry } : {}) }),
    },
    api: {
      seasons: async () => seasons,
      matchups: async () => matchups,
      submit: async (matchupId, body) => {
        if (submitError) throw submitError;
        calls.submits.push({ matchupId, body });
        return { alreadyRecorded: false };
      },
    },
    pending: {
      get: async () => pending,
      set: async (value) => void (pending = value),
      clear: async (gameId) => {
        if (pending?.gameId === gameId) pending = null;
      },
    },
  });
  const replay = async (messages: unknown[]) => {
    for (const message of messages) await flow.handle(message as ScoliaMessage);
    await flow.idle();
  };
  return { flow, calls, replay, getPending: () => pending };
};

const guestSeason: Season = { ...season, bestOf: 3 };

test("guest game: one confirmation at the end, no guess, sides as chosen", async () => {
  const guestMatchup = matchup("m1", "Chaoslordi", "Stocki");
  const { calls, replay, getPending } = setup({
    seasons: [guestSeason],
    matchups: [guestMatchup],
    // Chaoslordi was "Player 2" in Scolia.
    choose: () => ({ matchupId: "m1", sides: { player1: "Player 2", player2: "Player 1" } }),
  });
  await replay(guestGame);

  assert.equal(calls.confirms.length, 1);
  assert.equal(calls.confirms[0]!.suggestion.best, null);
  assert.deepEqual(calls.confirms[0]!.score, { "Player 1": 1, "Player 2": 2 });
  assert.equal(calls.warnings.length, 0, "101 / double out / race to 2 matches a best-of-3 101 season");

  assert.equal(calls.submits.length, 1);
  const { matchupId, body } = calls.submits[0]!;
  assert.equal(matchupId, "m1");
  assert.equal(body.source.gameId, "PW7TCR65BNKP");
  assert.deepEqual(body.legs, [
    { legNumber: 1, player1Remaining: 0, player2Remaining: 11, player1Darts: 5, player2Darts: 3 },
    { legNumber: 2, player1Remaining: 30, player2Remaining: 0, player1Darts: 6, player2Darts: 8 },
    { legNumber: 3, player1Remaining: 0, player2Remaining: 5, player1Darts: 13, player2Darts: 12 },
  ]);
  assert.equal(getPending(), null, "pending result is cleared after sending");
  assert.deepEqual(calls.notifications.map((n) => n.kind), ["success"]);
});

test("user game: guesses the matchup and sides from nicknames", async () => {
  const { calls, replay } = setup({
    matchups: [matchup("m1", "chaoslordi", "Roskato"), matchup("m2", "Stocki", "Roskato")],
  });
  await replay([userGameEnded]);

  const best = calls.confirms[0]!.suggestion.best;
  assert.equal(best?.matchup.id, "m1");
  // Roskato is Scolia player1 (69e1…), but matchup player2.
  assert.deepEqual(best?.sides, {
    player1: "6978ddcba726e963e02fc94f",
    player2: "69e1306d8a9cfd2b6c393118",
  });
  assert.deepEqual(calls.submits[0]!.body.legs, [
    { legNumber: 1, player1Remaining: 61, player2Remaining: 0, player1Darts: 3, player2Darts: 4 },
    { legNumber: 2, player1Remaining: 101, player2Remaining: 0, player1Darts: 6, player2Darts: 4 },
    { legNumber: 3, player1Remaining: 41, player2Remaining: 0, player1Darts: 3, player2Darts: 4 },
  ]);
  assert.equal(calls.submits[0]!.body.playedAt, "2026-10-13T09:45:58.994Z");
});

test("a duplicate end message is reported once", async () => {
  const { calls, replay } = setup({ matchups: [matchup("m1", "Chaoslordi", "Roskato")] });
  await replay([userGameEnded, userGameEnded]);
  assert.equal(calls.confirms.length, 1);
  assert.equal(calls.submits.length, 1);
});

test("an aborted game sends nothing", async () => {
  const aborted = structuredClone(userGameEnded);
  aborted.payload.game.status = "Aborted";
  const { calls, replay } = setup({ matchups: [matchup("m1", "Chaoslordi", "Roskato")] });
  await replay([{ type: "API::X01::GAME_DELETED", payload: { isAborted: true } }, aborted]);
  assert.equal(calls.confirms.length, 0);
  assert.equal(calls.submits.length, 0);
});

test("discard clears the pending result, later keeps it", async () => {
  const discard = setup({ choose: () => "discard" });
  await discard.replay([userGameEnded]);
  assert.equal(discard.getPending(), null);

  const later = setup({ choose: () => "later" });
  await later.replay([userGameEnded]);
  assert.equal(later.getPending()?.gameId, "8VBHS7RB5NTM");
  assert.equal(later.calls.submits.length, 0);
});

test("a pending result from before a reload is offered again", async () => {
  const stored: PendingResult = {
    gameId: "8VBHS7RB5NTM",
    game: userGameEnded.payload.game as unknown as PendingResult["game"],
    startNicknames: [],
  };
  const { flow, calls } = setup({ stored, matchups: [matchup("m1", "Chaoslordi", "Roskato")] });
  await flow.resumePending();
  assert.equal(calls.submits.length, 1);
});

test("a failed submit keeps the result pending and offers a retry", async () => {
  const { calls, replay, getPending } = setup({
    matchups: [matchup("m1", "Chaoslordi", "Roskato")],
    submitError: new Error("Cannot reach fusion"),
  });
  await replay([userGameEnded]);
  assert.equal(getPending()?.gameId, "8VBHS7RB5NTM");
  const [notification] = calls.notifications;
  assert.equal(notification?.kind, "error");
  assert.ok(notification?.retry);
});

test("the start check warns when no season matches the game setup", async () => {
  const { calls, replay } = setup({ seasons: [{ ...season, mode: 501 }] });
  const start = guestGame.find((m) => m.type === "API::BULL_THROW::GAME_CURRENT_STATE");
  await replay([start]);
  assert.equal(calls.warnings.length, 1);
  assert.match(calls.warnings[0]!, /start score 101 instead of 501/);
});

test("configMismatches compares start score, check modes and legs", () => {
  const config: GameConfig = {
    scoreType: "RaceTo",
    sets: 1,
    legs: 3,
    startScore: 501,
    gameInType: "Straight",
    gameOutType: "Double",
  };
  assert.deepEqual(configMismatches(config, { ...season, mode: 501, bestOf: 5 }), []);
  assert.deepEqual(configMismatches({ ...config, gameOutType: "Straight" }, { ...season, mode: 501 }), [
    "Straight out instead of Double out",
  ]);
  assert.equal(configMismatches({ ...config, legs: 2 }, { ...season, mode: 501 }).length, 1);
});

test("edited dart counts follow the Scolia player, whichever side they are on", () => {
  const game = userGameEnded.payload.game as unknown as PendingResult["game"];
  const roskato = "69e1306d8a9cfd2b6c393118";
  const chaoslordi = "6978ddcba726e963e02fc94f";
  const body = buildResultBody("8VBHS7RB5NTM", game, {
    matchupId: "m1",
    sides: { player1: chaoslordi, player2: roskato },
    // Chaoslordi really threw 3 darts in leg 2, not 6.
    darts: { [roskato]: [4, 4, 4], [chaoslordi]: [3, 3, 3] },
  });
  assert.deepEqual(
    body.legs.map((leg) => [leg.player1Darts, leg.player2Darts]),
    [[3, 4], [3, 4], [3, 4]],
  );
  assert.equal(body.source.edited, true);

  const unchanged = buildResultBody("8VBHS7RB5NTM", game, {
    matchupId: "m1",
    sides: { player1: chaoslordi, player2: roskato },
    darts: { [roskato]: [4, 4, 4], [chaoslordi]: [3, 6, 3] },
  });
  assert.equal(unchanged.source.edited, false);
});
