// Messages the MAIN-world logger forwards to the ISOLATED-world bridge via window.postMessage.

export const BRIDGE_SOURCE = "scolia-score-reader";

export type ScoliaMessage = { id?: string; type: string; payload: unknown };

export type BridgeEnvelope =
  | { source: typeof BRIDGE_SOURCE; kind: "socket"; url: string }
  | { source: typeof BRIDGE_SOURCE; kind: "event"; message: ScoliaMessage };

export const isBridgeEnvelope = (data: unknown): data is BridgeEnvelope => {
  if (typeof data !== "object" || data === null) return false;
  const envelope = data as Record<string, unknown>;
  if (envelope["source"] !== BRIDGE_SOURCE) return false;
  if (envelope["kind"] === "socket") return typeof envelope["url"] === "string";
  const message = envelope["message"];
  return (
    envelope["kind"] === "event" &&
    typeof message === "object" &&
    message !== null &&
    typeof (message as Record<string, unknown>)["type"] === "string"
  );
};
