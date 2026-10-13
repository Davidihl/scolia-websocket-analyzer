// ISOLATED-world content script: receives Scolia events from the MAIN-world logger
// and, once the user agrees to track results, runs the match flow. It never sees the
// API token; requests go through the service worker.

import { callBackground } from "./api";
import { requestTracking } from "./consent";
import { createMatchFlow } from "./match-flow";
import { createPageUi } from "./matchup-modal";
import { isBridgeEnvelope, type ScoliaMessage } from "./protocol";

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

// "undecided" holds events until the user answers, so the game start isn't missed.
let tracking: "undecided" | "enabled" | "disabled" = "undecided";
let held: ScoliaMessage[] = [];
let asked = false;

const askToTrack = async () => {
  const enabled = await requestTracking();
  tracking = enabled ? "enabled" : "disabled";
  console.log(`[Scolia Score Reader] Result tracking ${tracking} for this page load`);

  const events = held;
  held = [];
  if (!enabled) return;
  for (const message of events) await flow.handle(message);
  await flow.resumePending().catch((error: unknown) => {
    console.warn("[Scolia Score Reader] Could not restore a pending result:", error);
  });
};

window.addEventListener("message", (event) => {
  // Only accept messages the page posted to itself with our tag.
  if (event.source !== window || !isBridgeEnvelope(event.data)) return;
  const envelope = event.data;

  if (envelope.kind === "socket") {
    // Scolia reconnects now and then; ask only for the first socket of the page load.
    if (!asked) {
      asked = true;
      void askToTrack();
    }
    return;
  }
  if (tracking === "enabled") void flow.handle(envelope.message);
  else if (tracking === "undecided") held.push(envelope.message);
});
