// Asks once per page load whether the extension should track match results. The
// answer lives only in memory, so a refresh asks again.

import { button, dialog, hint } from "./ui/classes";
import { h, modal, modalHeader, mountShadow } from "./ui/shadow-modal";

let decision: Promise<boolean> | undefined;

const showModal = async (): Promise<boolean> => {
  const { root, close } = await mountShadow();

  return new Promise((resolve) => {
    const answer = (enabled: boolean) => () => {
      close();
      resolve(enabled);
    };
    root.append(
      modal(
        modalHeader("Track match results?"),
        h(
          "div",
          { class: "grid gap-2" },
          h(
            "p",
            {},
            "The extension can report finished matches on this board to your darts season. You confirm each result before it's sent.",
          ),
          h("p", { class: hint }, "You'll be asked again after a reload."),
        ),
        h(
          "div",
          { class: dialog.footer },
          h("button", { class: button.outline, onclick: answer(false) }, "Not now"),
          h("button", { class: button.primary, onclick: answer(true) }, "Track results"),
        ),
      ),
    );
  });
};

export const requestTracking = () => (decision ??= showModal());
