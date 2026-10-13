// User settings edited on the options page. Stored in chrome.storage.local, so
// only extension contexts (options page, service worker) can read them. Never
// pass these to the MAIN-world logger script: the page could read the token.

export type Settings = {
  endpoint: string;
  bearerToken: string;
};

const DEFAULTS: Settings = {
  endpoint: "",
  bearerToken: "",
};

export const loadSettings = async (): Promise<Settings> => {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...(stored as Partial<Settings>) };
};

export const saveSettings = (settings: Settings) =>
  chrome.storage.local.set(settings);
