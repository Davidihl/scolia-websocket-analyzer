// Shared shell for UI injected into the Scolia page. A closed shadow root keeps the
// page's styles out of our UI and ours out of the page.

export const whenBodyReady = () =>
  new Promise<HTMLElement>((resolve) => {
    if (document.body) return resolve(document.body);
    document.addEventListener("DOMContentLoaded", () => resolve(document.body), {
      once: true,
    });
  });

const BASE_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    font: 14px/1.4 system-ui, sans-serif;
  }
  .modal {
    background: #fff; color: #111; border-radius: 8px;
    padding: 20px 24px; width: min(460px, calc(100vw - 32px));
    max-height: calc(100vh - 32px); overflow: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }
  h2 { margin: 0 0 8px; font-size: 16px; }
  p { margin: 0 0 8px; }
  code { word-break: break-all; font-size: 12px; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  button {
    padding: 6px 14px; border-radius: 4px; border: 1px solid #ccc;
    background: #fff; color: #111; cursor: pointer; font: inherit;
  }
  button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
`;

export const mountShadow = async (css = "") => {
  const body = await whenBodyReady();
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = BASE_CSS + css;
  root.append(style);
  body.append(host);
  return { root, close: () => host.remove() };
};

type Child = Node | string | null | undefined | false;

/** Tiny DOM builder. Text always goes through text nodes, so page data can't inject HTML. */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean | ((event: Event) => void)>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") element.addEventListener(key.replace(/^on/, ""), value);
    else if (value === true) element.setAttribute(key, "");
    else if (typeof value === "string") element.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
};
