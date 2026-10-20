// shadcn/ui class recipes for plain DOM (see styles.css for the theme tokens).
// Tailwind scans this file at build time, so classes must appear here as literal strings.

const focusRing =
  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const invalidRing =
  "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const buttonBase = `inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 ${focusRing}`;

export const button = {
  primary: `${buttonBase} h-9 px-4 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90`,
  outline: `${buttonBase} h-9 px-4 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50`,
  outlineSm: `${buttonBase} h-8 px-3 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50`,
  ghost: `${buttonBase} h-9 px-4 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50`,
  ghostSm: `${buttonBase} h-8 px-3 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50`,
  ghostIcon: `${buttonBase} size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50`,
};

const field = `min-w-0 rounded-md border border-input bg-transparent text-sm shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 ${focusRing} ${invalidRing}`;

export const input = `${field} h-9 w-full px-3 py-1`;
export const inputSm = `${field} h-8 w-16 px-2 tabular-nums`;
export const select = `${field} h-9 w-full px-2`;
export const label = "text-sm font-medium leading-none select-none";
export const fieldLabel = `${label} mb-2 block`;
export const hint = "text-muted-foreground text-xs";

export const dialog = {
  backdrop: "fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/50 p-4",
  content:
    "grid max-h-[calc(100vh-32px)] w-full max-w-lg gap-4 overflow-auto rounded-lg border bg-background p-6 text-foreground shadow-lg",
  footer: "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
};

export const alertWarning =
  "rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground";

export const table = {
  table: "w-full text-sm tabular-nums",
  th: "h-10 border-b px-2 text-left align-middle font-medium text-muted-foreground",
  td: "border-b p-2 align-middle",
};

export const toast = {
  list: "fixed right-4 bottom-4 z-[2147483647] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2",
  item: "flex items-center gap-3 rounded-lg border bg-background p-4 text-sm text-foreground shadow-lg",
  icon: {
    success:
      "flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-xs font-bold text-white",
    error:
      "flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-xs font-bold text-white",
    warning:
      "flex size-5 shrink-0 items-center justify-center rounded-full bg-warning text-xs font-bold text-white",
  },
};
