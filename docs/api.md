# Darts API used by the extension

The extension talks to the fusion-local Darts API. fusion-local's `README.md` (section "Darts API") is the source of truth; this page summarizes what the extension relies on.

Set the **endpoint** in the extension options to the API base, e.g. `https://fusion.example.com/api/v1/darts`. The token needs the scopes `darts:read` and `darts:write`. Every request sends `Authorization: Bearer <token>`.

| Request | Scope | Response |
| --- | --- | --- |
| `GET /seasons` | `darts:read` | Running seasons: `[{ id, shortId, name, mode, bestOf, checkIn, checkOut, startDate }]` |
| `GET /seasons/:seasonId/matchups` | `darts:read` | Open matchups: `[{ id, shortId, roundNumber, player1: { id, alias }, player2: { id, alias } }]` |
| `PUT /matchups/:matchupId/result` | `darts:write` | `200 { id, player1Score, player2Score, winnerId, playedAt }` |

`PUT` body:

```json
{
  "playedAt": "2026-10-13T09:45:58.994Z",
  "legs": [
    { "legNumber": 1, "player1Remaining": 61, "player2Remaining": 0, "player1Darts": 3, "player2Darts": 4 }
  ],
  "source": { "system": "scolia", "gameId": "8VBHS7RB5NTM", "edited": false }
}
```

How the extension fills it from `GAME_ENDED_STATISTICS`:

- `player1` / `player2` are the matchup's sides. The user confirms which Scolia player is which in the modal.
- Legs are numbered across sets in Scolia's order. `…Remaining` is the last entry of the leg's `remainingScores`, and `…Darts` is the leg's `statistics.throwCount`, filler darts included (see readme.md, "Caveats"). The player can correct the dart counts in the confirm dialog, and `source.edited` is `true` when they did.
- `playedAt` is `startTime + netDuration`.

Errors are `{ error: string }`. The extension shows that message in a toast. The one exception is `409 "Matchup already played"`, which it treats as success, since it means an earlier attempt already went through.
