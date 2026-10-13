// Asks once per page load whether logging should be enabled. The answer lives
// only in memory, so a refresh asks again.

let decision: Promise<boolean> | undefined;

const whenBodyReady = () =>
  new Promise<HTMLElement>((resolve) => {
    if (document.body) return resolve(document.body);
    document.addEventListener("DOMContentLoaded", () => resolve(document.body), {
      once: true,
    });
  });

const showModal = async (url: string): Promise<boolean> => {
  const body = await whenBodyReady();

  // Shadow DOM keeps the page's styles from leaking into the modal and vice versa.
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .backdrop {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        font: 14px/1.4 system-ui, sans-serif;
      }
      .modal {
        background: #fff; color: #111; border-radius: 8px;
        padding: 20px 24px; max-width: 420px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      }
      h2 { margin: 0 0 8px; font-size: 16px; }
      code { word-break: break-all; font-size: 12px; }
      .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
      button { padding: 6px 14px; border-radius: 4px; border: 1px solid #ccc; cursor: pointer; font: inherit; }
      button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
    </style>
    <div class="backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <h2>Scolia Score Reader</h2>
        <p>Detected WebSocket <code></code>. Log its messages to the console for this page load?</p>
        <div class="actions">
          <button data-answer="no">Not now</button>
          <button class="primary" data-answer="yes">Enable logging</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector("code")!.textContent = url;
  body.append(host);

  return new Promise((resolve) => {
    root.addEventListener("click", (event) => {
      const answer = (event.target as HTMLElement).dataset["answer"];
      if (!answer) return;
      host.remove();
      resolve(answer === "yes");
    });
  });
};

export const requestConsent = (url: string) => (decision ??= showModal(url));
