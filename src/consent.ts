// Asks once per page load whether the extension should track match results. The
// answer lives only in memory, so a refresh asks again.

import { h, modalHeader, mountShadow } from "./ui/shadow-modal";

let decision: Promise<boolean> | undefined;

const showModal = async (): Promise<boolean> => {
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
          modalHeader("Track match results?"),
          h(
            "p",
            {},
            "The extension can report finished matches on this board to your darts season. You confirm each result before it's sent.",
          ),
          h("p", { class: "hint" }, "You'll be asked again after a reload."),
          h(
            "div",
            { class: "actions" },
            h("button", { onclick: answer(false) }, "Not now"),
            h("button", { class: "primary", onclick: answer(true) }, "Track results"),
          ),
        ),
      ),
    );
  });
};

export const requestTracking = () => (decision ??= showModal());
