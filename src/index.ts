// MAIN-world script: wraps window.WebSocket to see Scolia's game events. Relevant
// events are logged to the console and handed to the ISOLATED-world bridge.

import { config } from "./config";
import { BRIDGE_SOURCE, type BridgeEnvelope, type ScoliaMessage } from "./protocol";

const isWatchedSocket = (url: string) => {
  try {
    const { pathname } = new URL(url);
    return config.socketPaths.some((path) => pathname.endsWith(path));
  } catch {
    return false;
  }
};

const parseMessage = (data: unknown): ScoliaMessage | null => {
  if (typeof data !== "string") return null;
  try {
    const message: unknown = JSON.parse(data);
    if (typeof message !== "object" || message === null) return null;
    return typeof (message as ScoliaMessage).type === "string" ? (message as ScoliaMessage) : null;
  } catch {
    return null;
  }
};

const post = (envelope: BridgeEnvelope) => window.postMessage(envelope, location.origin);

const onMessage = (url: string, data: unknown) => {
  const message = parseMessage(data);
  if (!message || !config.eventTypes.has(message.type)) return;

  console.groupCollapsed(`[Scolia Score Reader] ${new Date().toISOString()} ${message.type}`);
  console.log("URL:", url);
  console.log("Message:", message);
  console.groupEnd();

  post({ source: BRIDGE_SOURCE, kind: "event", message });
};

const OriginalWebSocket = window.WebSocket;

window.WebSocket = new Proxy(OriginalWebSocket, {
  construct(Target, args, newTarget) {
    const socket: WebSocket = Reflect.construct(Target, args, newTarget);

    if (isWatchedSocket(socket.url)) {
      socket.addEventListener("message", (event) => onMessage(socket.url, event.data));
      console.log("[Scolia Score Reader] Watching:", socket.url);
      post({ source: BRIDGE_SOURCE, kind: "socket", url: socket.url });
    }

    return socket;
  },
});

console.log("[Scolia Score Reader] Installed, logging:", [...config.eventTypes]);
