import { callBackground } from "./api";
import { loadSettings, saveSettings } from "./settings";

const form = document.querySelector<HTMLFormElement>("#form")!;
const endpoint = document.querySelector<HTMLInputElement>("#endpoint")!;
const bearerToken = document.querySelector<HTMLInputElement>("#bearerToken")!;
const testButton = document.querySelector<HTMLButtonElement>("#test")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;

const showStatus = (text: string, isError = false) => {
  status.textContent = text;
  status.classList.toggle("error", isError);
};

void loadSettings().then((settings) => {
  endpoint.value = settings.endpoint;
  bearerToken.value = settings.bearerToken;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const url = endpoint.value.trim();
  if (url && !URL.canParse(url)) {
    showStatus("Endpoint is not a valid URL.", true);
    return;
  }

  // Must run before any await: Chrome only shows the prompt during the click.
  const granted = url
    ? chrome.permissions.request({ origins: [`${new URL(url).origin}/*`] })
    : Promise.resolve(true);

  void (async () => {
    await saveSettings({ endpoint: url, bearerToken: bearerToken.value.trim() });
    if (!(await granted)) {
      showStatus("Saved, but access to the endpoint was not granted.", true);
      return;
    }
    showStatus("Saved.");
  })();
});

testButton.addEventListener("click", async () => {
  showStatus("Testing…");
  try {
    const seasons = await callBackground({ kind: "seasons" });
    showStatus(
      seasons.length === 0
        ? "Connected, but there is no running season."
        : `Connected. Running: ${seasons.map((season) => season.name).join(", ")}.`,
    );
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
});
