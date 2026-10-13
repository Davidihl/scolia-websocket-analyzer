// ISOLATED-world content script: receives Scolia events from the MAIN-world logger
// and runs the match flow. It never sees the API token; requests go through the
// service worker.

import { callBackground } from "./api";
import { createMatchFlow } from "./match-flow";
import { createPageUi } from "./matchup-modal";
import { isBridgeEnvelope } from "./protocol";

const flow = createMatchFlow({
  ui: createPageUi(),
  api: {
    seasons: () => callBackground({ kind: "seasons" }),
    matchups: (seasonId) => callBackground({ kind: "matchups", seasonId }),
    submit: (matchupId, body) => callBackground({ kind: "submit", matchupId, body }),
  },
  pending: {
    get: () => callBackground({ kind: "pending:get" }),
    set: async (pending) => void (await callBackground({ kind: "pending:set", pending })),
    clear: async (gameId) => void (await callBackground({ kind: "pending:clear", gameId })),
  },
});

window.addEventListener("message", (event) => {
  // Only accept messages the page posted to itself with our tag.
  if (event.source !== window || !isBridgeEnvelope(event.data)) return;
  void flow.handle(event.data.message);
});

void flow.resumePending().catch((error: unknown) => {
  console.warn("[Scolia Score Reader] Could not restore a pending result:", error);
});
