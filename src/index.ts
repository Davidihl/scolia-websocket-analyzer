import { config } from "./config";

type Direction = "RX" | "TX";

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

const logMessage = (direction: Direction, url: string, data: unknown) => {
  if (direction === "RX" ? !config.logIncoming : !config.logOutgoing) return;

  const message = parsePayload(data);
  const type = getEventType(message);
  const isKnown = type !== undefined && config.eventTypes.has(type);
  if (!isKnown && !config.logUnknownTypes) return;

  console.groupCollapsed(
    `[WebSocket ${direction}] ${new Date().toISOString()} ${type ?? "(no type)"}`,
  );
  console.log("URL:", url);
  console.log("Message:", message);
  console.groupEnd();
};

const OriginalWebSocket = window.WebSocket;

window.WebSocket = new Proxy(OriginalWebSocket, {
  construct(Target, args, newTarget) {
    const socket: WebSocket = Reflect.construct(Target, args, newTarget);

    if (isWatchedSocket(socket.url)) {
      socket.addEventListener("message", (event) => {
        logMessage("RX", socket.url, event.data);
      });
      console.log("[WebSocket] Watching:", socket.url);
    }

    return socket;
  },
});

const originalSend = OriginalWebSocket.prototype.send;

OriginalWebSocket.prototype.send = function (
  this: WebSocket,
  data: Parameters<WebSocket["send"]>[0],
) {
  if (isWatchedSocket(this.url)) logMessage("TX", this.url, data);
  return originalSend.call(this, data);
};

console.log("[WebSocket Logger] Installed", config);
