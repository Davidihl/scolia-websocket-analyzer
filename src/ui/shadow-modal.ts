// Shared shell for UI injected into the Scolia page. A closed shadow root keeps the
// page's styles out of our UI and ours out of the page.

import logo from "../../public/icons/icon-128.png";
import { dialog } from "./classes";
import css from "./styles.css";

export const whenBodyReady = () =>
  new Promise<HTMLElement>((resolve) => {
    if (document.body) return resolve(document.body);
    document.addEventListener("DOMContentLoaded", () => resolve(document.body), {
      once: true,
    });
  });

export const mountShadow = async () => {
  const body = await whenBodyReady();
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = css;
  root.append(style);
  body.append(host);
  return { root, close: () => host.remove() };
};

export type Child = Node | string | null | undefined | false;

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

/** Logo, extension name and title, so it's clear the dialog comes from the extension. */
export const modalHeader = (title: string) =>
  h(
    "div",
    { class: "flex items-center gap-3" },
    h("img", { src: logo, alt: "", class: "size-9 shrink-0" }),
    h(
      "div",
      { class: "grid gap-0.5" },
      h("small", { class: "text-xs text-muted-foreground" }, "Scolia Score Reader"),
      h("h2", { class: "text-lg font-semibold leading-none" }, title),
    ),
  );

/** Backdrop + dialog card, shadcn style. */
export const modal = (...children: Child[]) =>
  h(
    "div",
    { class: dialog.backdrop },
    h("div", { class: dialog.content, role: "dialog", "aria-modal": "true" }, ...children),
  );
