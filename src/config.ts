export const config = {
  // Only sockets whose URL path ends with one of these are watched.
  socketPaths: ["/api/client"],
  // Events the result reporting needs (see readme.md). Only these are logged to the
  // console and handed to the extension; everything else on the socket is ignored.
  eventTypes: new Set<string>([
    // Game setup and player nicknames, for the start-of-game check.
    "API::BULL_THROW::GAME_CURRENT_STATE",
    "API::GAME::GAME_CURRENT_STATE",
    // Aborted games are never reported.
    "API::X01::GAME_DELETED",
    // The final result that gets sent to the API.
    "API::GAME::GAME_ENDED_STATISTICS",
  ]),
};
