import { loadSettings, saveSettings } from "./settings";

const form = document.querySelector<HTMLFormElement>("#form")!;
const endpoint = document.querySelector<HTMLInputElement>("#endpoint")!;
const bearerToken = document.querySelector<HTMLInputElement>("#bearerToken")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;

const showStatus = (text: string, isError = false) => {
  status.textContent = text;
  status.classList.toggle("error", isError);
};

void loadSettings().then((settings) => {
  endpoint.value = settings.endpoint;
  bearerToken.value = settings.bearerToken;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = endpoint.value.trim();
  if (url && !URL.canParse(url)) {
    showStatus("Endpoint is not a valid URL.", true);
    return;
  }

  await saveSettings({ endpoint: url, bearerToken: bearerToken.value.trim() });
  showStatus("Saved.");
});
