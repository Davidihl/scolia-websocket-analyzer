// Asks once per page load whether logging should be enabled. The answer lives
// only in memory, so a refresh asks again.

import { h, mountShadow } from "./ui/shadow-modal";

let decision: Promise<boolean> | undefined;

const showModal = async (url: string): Promise<boolean> => {
  const { root, close } = await mountShadow();

  return new Promise((resolve) => {
    const answer = (enabled: boolean) => () => {
      close();
      resolve(enabled);
    };
    root.append(
      h(
        "div",
        { class: "backdrop" },
        h(
          "div",
          { class: "modal", role: "dialog", "aria-modal": "true" },
          h("h2", {}, "Scolia Score Reader"),
          h(
            "p",
            {},
            "Detected WebSocket ",
            h("code", {}, url),
            ". Log its messages to the console for this page load?",
          ),
          h(
            "div",
            { class: "actions" },
            h("button", { onclick: answer(false) }, "Not now"),
            h("button", { class: "primary", onclick: answer(true) }, "Enable logging"),
          ),
        ),
      ),
    );
  });
};

export const requestConsent = (url: string) => (decision ??= showModal(url));
