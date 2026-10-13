// Messages the MAIN-world logger forwards to the ISOLATED-world bridge via window.postMessage.

export const BRIDGE_SOURCE = "scolia-score-reader";

export const FORWARDED_TYPES = new Set([
  "API::BULL_THROW::GAME_CURRENT_STATE",
  "API::GAME::GAME_CURRENT_STATE",
  "API::X01::GAME_DELETED",
  "API::GAME::GAME_ENDED_STATISTICS",
]);

export type ScoliaMessage = { id?: string; type: string; payload: unknown };

export type BridgeEnvelope = { source: typeof BRIDGE_SOURCE; message: ScoliaMessage };

export const isBridgeEnvelope = (data: unknown): data is BridgeEnvelope => {
  if (typeof data !== "object" || data === null) return false;
  const { source, message } = data as Partial<BridgeEnvelope>;
  return (
    source === BRIDGE_SOURCE &&
    typeof message === "object" &&
    message !== null &&
    typeof message.type === "string"
  );
};
