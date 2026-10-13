import { config } from "./config";
import { requestConsent } from "./consent";

type Direction = "RX" | "TX";

type Entry = { direction: Direction; url: string; data: unknown; time: Date };

const isWatchedSocket = (url: string) => {
  try {
    const { pathname } = new URL(url);
    return config.socketPaths.some((path) => pathname.endsWith(path));
  } catch {
    return false;
  }
};

const parsePayload = (data: unknown): unknown => {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

const getEventType = (message: unknown): string | undefined => {
  if (typeof message !== "object" || message === null) return undefined;
  const { type } = message as { type?: unknown };
  return typeof type === "string" ? type : undefined;
};

const logMessage = ({ direction, url, data, time }: Entry) => {
  if (direction === "RX" ? !config.logIncoming : !config.logOutgoing) return;

  const message = parsePayload(data);
  const type = getEventType(message);
  const isKnown = type !== undefined && config.eventTypes.has(type);
  if (!isKnown && !config.logUnknownTypes) return;

  console.groupCollapsed(
    `[WebSocket ${direction}] ${time.toISOString()} ${type ?? "(no type)"}`,
  );
  console.log("URL:", url);
  console.log("Message:", message);
  console.groupEnd();
};

// "pending" buffers messages until the user answers the consent modal.
let state: "pending" | "enabled" | "disabled" = config.askBeforeLogging
  ? "pending"
  : "enabled";
let buffer: Entry[] = [];

const handle = (entry: Entry) => {
  if (state === "enabled") logMessage(entry);
  else if (state === "pending") buffer.push(entry);
};

const onWatchedSocket = (url: string) => {
  if (!config.askBeforeLogging) return;
  void requestConsent(url).then((enabled) => {
    state = enabled ? "enabled" : "disabled";
    console.log(`[WebSocket Logger] Logging ${state}`);
    if (enabled) buffer.forEach(logMessage);
    buffer = [];
  });
};

const OriginalWebSocket = window.WebSocket;

window.WebSocket = new Proxy(OriginalWebSocket, {
  construct(Target, args, newTarget) {
    const socket: WebSocket = Reflect.construct(Target, args, newTarget);

    if (isWatchedSocket(socket.url)) {
      socket.addEventListener("message", (event) => {
        handle({ direction: "RX", url: socket.url, data: event.data, time: new Date() });
      });
      console.log("[WebSocket] Watching:", socket.url);
      onWatchedSocket(socket.url);
    }

    return socket;
  },
});

const originalSend = OriginalWebSocket.prototype.send;

OriginalWebSocket.prototype.send = function (
  this: WebSocket,
  data: Parameters<WebSocket["send"]>[0],
) {
  if (isWatchedSocket(this.url)) {
    handle({ direction: "TX", url: this.url, data, time: new Date() });
  }
  return originalSend.call(this, data);
};

console.log("[WebSocket Logger] Installed", config);
