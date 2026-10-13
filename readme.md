# Scolia stream: how a match is structured

Findings from two captures in `demo-data/`:

- `completegame.json`: 146 messages of one complete 2-player X01 match between **guests**. Race to 2 legs, start score 101, double out, Player 2 wins 2-1.
- `ended-statistics-users.json`: only the `GAME_ENDED_STATISTICS` message of a match between two **registered users** (Chaoslordi vs Roskato). Race to 3 legs, 101, double out, Roskato wins 3-0. The file is reduced: per-visit history (`history`) and detailed stat breakdowns were removed. The fields the extension reads are kept verbatim.

Every message has the shape `{ id, type, payload }`.

# Player identity: guests vs registered users

How players are identified depends on the player type in `configuration.playerTypes.playerN`:

| | Guest (`"Guest"`) | Registered user (`"User"`) |
| --- | --- | --- |
| Player IDs (`competitors[].id`, `statistics[].userId`, `winnerIds`, `history.*`, `scoreboard.*`) | The display label, e.g. `"Player 1"` | The Scolia user ID, a 24-hex ObjectId such as `"69e1306d8a9cfd2b6c393118"` |
| `configuration.playerNames.playerN` | The display label | The user ID (not a name) |
| `participants` | `[]` | `[{ _id, nickname }]`, the **only** human-readable name, e.g. `"Chaoslordi"` |

So use `participants[].nickname` to get a user's name, and key everything else by ID. The order of `participants` does not follow `playerNames` or `competitors`.

Other fields of interest in the user capture:

- `boardNamesForParticipants`: board name per player ID, e.g. `"Austrian Force Hub"`.
- `scoreboard.sets[].legs[].startingPlayerUserId`: who threw first in each leg.
- `history.sets[].legs[].rounds`: per-visit throws. `throwMode` is `ManuallyAdded` for entered or detected darts and `AddedByTheGameService` for filler darts after a checkout or a skipped visit.

The start snapshots also carry a nickname per player ID: `BULL_THROW::GAME_CURRENT_STATE` in `payload.gameState.players[id].nickname`, and `GAME::GAME_CURRENT_STATE` in `payload.state.game.players[id].nickname`, alongside `playerType`. In the guest capture the nickname is just the label (`"Player 1"`). It is likely that a user game carries the real nickname there, but that is unverified until a user game's start is captured.

# Event types

| Type                                                | Count   | Purpose                                                                                                                                                                                                       |
| --------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API::COMMON::PUBLISH`                              | 3       | Board state (`payload.data.currentState`): `state` (`InGame` / `Online`), `phase`, and `gameData` with the game config. Detects that the board is occupied / a game is in progress, and that it is free again |
| `API::BULL_THROW::GAME_CURRENT_STATE`               | 1       | Full snapshot at the start of the bull-off. Config sits under `configuration.nextGame`                                                                                                                        |
| `API::BULL_THROW::GAME_STATE_CHANGED`               | 4       | Bull-off throws (`lastThrows`, `lastTriplets`)                                                                                                                                                                |
| `API::COMMON::TAKEOUT_STARTED` / `TAKEOUT_FINISHED` | 19 / 19 | Player removes the darts. Empty payload `{}`                                                                                                                                                                  |
| `API::COMMON::SCORE_CORRECTION_STATE`               | 17      | Correction state, sent once per visit                                                                                                                                                                         |
| `API::GAME::GAME_CURRENT_STATE`                     | 1       | Full X01 snapshot right before the game starts                                                                                                                                                                |
| `API::X01::GAME_STARTED`                            | 1       | Explicit start of the actual X01 game. Empty payload                                                                                                                                                          |
| `API::GAME::GAME_STATE_CHANGED`                     | 78      | Scores, statistics, throws, phase and winners. **Delta encoded** (see below)                                                                                                                                  |
| `API::X01::GAME_DELETED`                            | 1       | Game over cleanup. Payload `{ isAborted: false }`                                                                                                                                                             |
| `API::X01::GAME_STATS`                              | 1       | Slim copy of the final stats (`statistics` keyed by player, `scoreboard`, `isAborted`)                                                                                                                        |
| `API::GAME::GAME_ENDED_STATISTICS`                  | 1       | **Final summary of the whole match.** Payload `{ game: {...} }`                                                                                                                                               |

`API::COMMON::PUBLISH` already reports `state: "InGame"` while the configured `nextGame` is still waiting for its bull throw. `API::X01::GAME_STARTED` is therefore the better signal for the start of the actual X01 game.

## Delta encoding of `GAME_STATE_CHANGED`

Payloads are jsondiffpatch-style diffs, and only the changed player/fields are included:

- `[old, new]` is a changed value, `_t: "a"` marks an array delta, `_0` is a removed array entry.
- `remainingScores: { "Player 1": [0, 0] }` is ambiguous. Do not rely on it. Use `GAME_ENDED_STATISTICS` instead of rebuilding state from deltas.
- A leg-ending message carries `winners.legWinner` and `currentGamePhase: [0, "WaitingForContinue"]`. The final one also carries `winners.gameWinners` and `winners.setWinners`.

# Match lifecycle (order in `completegame.json`)

1. `BULL_THROW::GAME_CURRENT_STATE` (snapshot with config, `playerOrder`, `currentPlayerId`).
2. `PUBLISH` (`state: "InGame"`, `phase: "Throw"`).
3. Bull-off: `BULL_THROW::GAME_STATE_CHANGED` per throw, each followed by `TAKEOUT_STARTED` / `TAKEOUT_FINISHED`.
4. Second `PUBLISH`, `SCORE_CORRECTION_STATE`, then `GAME::GAME_CURRENT_STATE` (X01 snapshot).
5. **`X01::GAME_STARTED`**: the match really begins.
6. Per visit, repeated: 2-3 `GAME_STATE_CHANGED` (one per dart), `TAKEOUT_STARTED`, `SCORE_CORRECTION_STATE`, `TAKEOUT_FINISHED`.
7. **Leg end**: a `GAME_STATE_CHANGED` with `winners.legWinner` (stream indices 32, 35, 71, 74 and 139 in the demo).
8. **Match end**, in this order: last `GAME_STATE_CHANGED` (with `gameWinners`), `TAKEOUT_STARTED`, `X01::GAME_DELETED`, `X01::GAME_STATS`, `TAKEOUT_FINISHED`, **`GAME::GAME_ENDED_STATISTICS`**, then a final `PUBLISH` with `state: "Online"` (board free).

# Game config

Read it from `game.configuration` in `GAME_ENDED_STATISTICS`. Earlier, the same config is available under `...nextGame.configuration` in `BULL_THROW::GAME_CURRENT_STATE` and in `PUBLISH` (`payload.data.currentState.gameData.configuration`).

Demo values:

```json
{
  "scoreType": "RaceTo",
  "legs": 2,
  "sets": 1,
  "startScore": 101,
  "gameInType": "Straight",
  "gameOutType": "Double",
  "throwOrderType": "Bull",
  "bullThrow": "WDF",
  "playerNr": 2
}
```

That means "first to 2 legs, 1 set, x101". A best-of format is probably `scoreType: "BestOf"`, but that value is not in any capture yet and is unverified.

# Game End Detection

Watching the whole match is not needed for a final summary. Listen for `API::GAME::GAME_ENDED_STATISTICS`.

Useful fields on `payload.game`: `gameId`, `_id`, `status` (`"Finished"`), `startTime`, `netDuration` (ms), `configuration`, `winnerIds`, `statistics[]`, `history`, `scoreboard`.

Per player, `statistics[i]` has `userId`, `statistics` (game totals: `throwCount`, `legsWon`, `setsWon`, `winner`, averages), `coordinates`, and `sets[s].legs[l]`:

| Field                                  | Meaning                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `statistics.throwCount`                | Darts thrown in that leg                                                                                                   |
| `remainingScores`                      | Remaining score after every dart. Starts at `startScore`, so it has `throwCount + 1` entries. Ends at 0 for the leg winner |
| `statistics.winner`                    | Whether this player won the leg                                                                                            |
| `statistics.totalScore`, `coordinates` | Points scored and dart positions in the leg                                                                                |

```ts
const g = msg.payload.game;
const legs = g.statistics[0].sets.flatMap((s, si) =>
  s.legs.map((_, li) => ({
    set: si + 1,
    leg: li + 1,
    players: Object.fromEntries(
      g.statistics.map((p) => {
        const l = p.sets[si].legs[li];
        return [
          p.userId,
          {
            darts: l.statistics.throwCount,
            remaining: l.remainingScores.at(-1),
            won: !!l.statistics.winner,
          },
        ];
      }),
    ),
  })),
);
```

## Demo results

`completegame.json` (guests): Player 2 wins 2-1 (24 darts vs 23 darts overall).

| Leg | Player 2: darts / remaining | Player 1: darts / remaining | Winner   |
| --- | --------------------------- | --------------------------- | -------- |
| 1   | 5 / 0                       | 3 / 11                      | Player 2 |
| 2   | 6 / 30                      | 8 / 0                       | Player 1 |
| 3   | 13 / 0                      | 12 / 5                      | Player 2 |

`ended-statistics-users.json` (registered users): Roskato wins 3-0 (12 darts vs 12 darts overall).

| Leg | Roskato: darts / remaining | Chaoslordi: darts / remaining | Winner  |
| --- | -------------------------- | ----------------------------- | ------- |
| 1   | 4 / 0                      | 3 / 61                        | Roskato |
| 2   | 4 / 0                      | 6 / 101                       | Roskato |
| 3   | 4 / 0                      | 3 / 41                        | Roskato |

# Caveats

- `statistics[]` is not in a fixed player order. Key by `userId`.
- `userId` is a display label for guests and a Scolia user ID for registered users (see "Player identity"). Names for registered users only come from `participants[].nickname`.
- `throwCount` counts filler darts too. In leg 2 of the user capture, Chaoslordi has `throwCount: 6`, but only one of those darts was thrown. The other five are `AddedByTheGameService` misses filling up visits.
- The message arrives once. If the listener is disconnected at match end, the summary is lost, as far as the stream shows.
- Aborted games are unverified. `GAME_DELETED` and `GAME_STATS` carry `isAborted`. It is unknown whether `GAME_ENDED_STATISTICS` is sent for an aborted game, so capture one to check.
- Use `game.gameId` to de-duplicate in case a message is delivered twice.
- Live displays (current score, leg wins as they happen) still need `PUBLISH`, `X01::GAME_STARTED` and `GAME_STATE_CHANGED`.
