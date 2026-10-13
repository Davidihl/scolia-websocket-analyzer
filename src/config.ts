// Event types documented in readme.md. Comment out the ones you don't want to log.
export const EVENT_TYPES = [
  "API::COMMON::PUBLISH",
  "API::BULL_THROW::GAME_CURRENT_STATE",
  "API::BULL_THROW::GAME_STATE_CHANGED",
  "API::COMMON::TAKEOUT_STARTED",
  "API::COMMON::TAKEOUT_FINISHED",
  "API::COMMON::SCORE_CORRECTION_STATE",
  "API::GAME::GAME_CURRENT_STATE",
  "API::X01::GAME_STARTED",
  "API::GAME::GAME_STATE_CHANGED",
  "API::X01::GAME_DELETED",
  "API::X01::GAME_STATS",
  "API::GAME::GAME_ENDED_STATISTICS",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const config = {
  // Only sockets whose URL path ends with one of these are logged.
  socketPaths: ["/api/client"],
  // Message `type` values to log. Messages without a matching `type` are dropped.
  eventTypes: new Set<string>(EVENT_TYPES),
  // Also log messages whose `type` is not in `eventTypes` (useful for discovering new types).
  logUnknownTypes: false,
  // Ask via a modal before logging. The answer only lasts until the page is reloaded.
  // Messages that arrive while the modal is open are buffered and logged if you enable it.
  askBeforeLogging: true,
  // Which directions to log.
  logIncoming: true,
  logOutgoing: false,
};
