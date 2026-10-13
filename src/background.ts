// Service worker: the only place that reads the bearer token and talks to fusion-local.

import type {
  BackgroundRequest,
  BackgroundResponseData,
  BackgroundResult,
  PendingResult,
} from "./api";
import { loadSettings } from "./settings";

const PENDING_KEY = "pendingResult";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const { endpoint, bearerToken } = await loadSettings();
  if (!endpoint || !bearerToken) {
    throw new ApiError("Set the endpoint and token in the extension options first.");
  }

  const base = endpoint.replace(/\/+$/, "");
  const origin = new URL(base).origin;
  if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) {
    throw new ApiError(`No permission for ${origin}. Open the extension options and click Save.`);
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ApiError(`Cannot reach ${origin}.`);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const serverError =
      typeof body === "object" && body !== null && "error" in body ? String(body.error) : null;
    const fallback: Record<number, string> = {
      401: "The token was rejected. Check it in the extension options.",
      403: "The token lacks the darts:read / darts:write scope.",
      429: `Too many requests. Try again in ${response.headers.get("Retry-After") ?? "a few"} seconds.`,
    };
    throw new ApiError(
      serverError ?? fallback[response.status] ?? `HTTP ${response.status}`,
      response.status,
    );
  }
  return body as T;
};

type Handlers = {
  [K in BackgroundRequest["kind"]]: (
    request: Extract<BackgroundRequest, { kind: K }>,
  ) => Promise<BackgroundResponseData[K]>;
};

const handlers: Handlers = {
  seasons: () => request("/seasons"),
  matchups: ({ seasonId }) => request(`/seasons/${encodeURIComponent(seasonId)}/matchups`),
  submit: async ({ matchupId, body }) => {
    try {
      await request(`/matchups/${encodeURIComponent(matchupId)}/result`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return { alreadyRecorded: false };
    } catch (error) {
      // A retry after a lost response: the first attempt already went through.
      if (error instanceof ApiError && error.status === 409 && /already played/i.test(error.message)) {
        return { alreadyRecorded: true };
      }
      throw error;
    }
  },
  "pending:get": async () => {
    const stored = await chrome.storage.session.get(PENDING_KEY);
    return (stored[PENDING_KEY] as PendingResult | undefined) ?? null;
  },
  "pending:set": async ({ pending }) => {
    await chrome.storage.session.set({ [PENDING_KEY]: pending });
    return null;
  },
  "pending:clear": async ({ gameId }) => {
    const stored = await chrome.storage.session.get(PENDING_KEY);
    if ((stored[PENDING_KEY] as PendingResult | undefined)?.gameId === gameId) {
      await chrome.storage.session.remove(PENDING_KEY);
    }
    return null;
  },
};

chrome.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
  // Only our own content scripts and pages may use the token.
  if (sender.id !== chrome.runtime.id) return false;

  const handler = handlers[message.kind] as (request: BackgroundRequest) => Promise<unknown>;
  if (!handler) return false;

  handler(message)
    .then((data): BackgroundResult<unknown> => ({ ok: true, data }))
    .catch(
      (error: unknown): BackgroundResult<unknown> => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    .then(sendResponse);
  // Keep the channel open for the async response.
  return true;
});
