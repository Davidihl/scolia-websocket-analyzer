// Page UI for the match flow: the "report result" modal and toasts.

import type { Matchup, Season } from "./api";
import type { RankedMatchup } from "./matching";
import { configMismatches, type ConfirmRequest, type MatchFlowUi } from "./match-flow";
import { minDarts, type ScoliaPlayer, type Sides } from "./scolia";
import { h, mountShadow } from "./ui/shadow-modal";

const CSS = `
  label { display: block; margin: 12px 0 4px; font-weight: 600; }
  select { width: 100%; padding: 6px 8px; font: inherit; }
  .score { font-size: 18px; font-weight: 600; margin: 4px 0 8px; }
  .hint { color: #555; font-size: 12px; }
  .warning { color: #92400e; background: #fef3c7; border-radius: 4px; padding: 6px 8px; margin-top: 12px; }
  .sides { display: grid; grid-template-columns: 1fr auto 1fr; gap: 4px 8px; align-items: center; }
  .sides .arrow { color: #888; }
  .swap { margin-top: 8px; }
  .spacer { flex: 1; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { padding: 3px 6px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-weight: 600; font-size: 12px; color: #555; }
  td input { width: 4.5em; padding: 2px 4px; font: inherit; }
  td input.invalid { border-color: #b91c1c; background: #fef2f2; }
  .rest { color: #555; }
`;

const TOAST_CSS = `
  .toasts {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    display: flex; flex-direction: column; gap: 8px; max-width: min(380px, calc(100vw - 32px));
    font: 14px/1.4 system-ui, sans-serif;
  }
  .toast {
    display: flex; gap: 8px; align-items: center;
    padding: 10px 12px; border-radius: 6px; color: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }
  .toast.success { background: #166534; }
  .toast.error { background: #991b1b; }
  .toast.warning { background: #92400e; }
  .toast span { flex: 1; }
  .toast button { padding: 2px 8px; }
`;

const displayName = (player: ScoliaPlayer) => player.name ?? player.id;

const matchupLabel = (matchup: Matchup) =>
  `R${matchup.roundNumber} · ${matchup.player1.alias ?? "?"} vs ${matchup.player2.alias ?? "?"}`;

const percent = (score: number) => `${Math.round(score * 100)}%`;

const showConfirm = async (request: ConfirmRequest) => {
  const { root, close } = await mountShadow(CSS);
  const { players, options, suggestion, score, game, legs } = request;
  const [first, second] = players;
  const rankedById = new Map(suggestion.ranked.map((entry) => [entry.matchup.id, entry]));

  let seasonId = suggestion.best?.season.id ?? options[0]?.season.id ?? "";
  let matchupId = suggestion.best?.matchup.id ?? "";
  let sides: Sides | null = suggestion.best?.sides ?? null;

  const seasonSelect = h("select", { id: "season" });
  const matchupSelect = h("select", { id: "matchup" });
  const sidesBox = h("div", { class: "sides" });
  const guessHint = h("p", { class: "hint" });
  const warning = h("div", { class: "warning", hidden: true });
  const reportButton = h("button", { class: "primary" }, "Report");

  // Dart counts per Scolia player, prefilled from Scolia and editable per leg.
  const darts: Record<string, number[]> = Object.fromEntries(
    players.map((player) => [player.id, (legs[player.id] ?? []).map((leg) => leg.darts)]),
  );
  const invalidInputs = new Set<HTMLInputElement>();

  const currentSeason = (): Season | undefined =>
    options.find((option) => option.season.id === seasonId)?.season;
  const currentMatchup = (): Matchup | undefined =>
    options.flatMap((option) => option.matchups).find((m) => m.id === matchupId);
  const defaultSides = (): Sides | null =>
    first && second ? { player1: first.id, player2: second.id } : null;

  const renderSeasons = () => {
    seasonSelect.replaceChildren(
      ...options.map(({ season }) =>
        h("option", { value: season.id, selected: season.id === seasonId }, season.name),
      ),
    );
    seasonSelect.disabled = options.length <= 1;
  };

  const renderMatchups = () => {
    const matchups = options.find((option) => option.season.id === seasonId)?.matchups ?? [];
    // Most likely matchups first.
    const sorted = [...matchups].sort(
      (a, b) => (rankedById.get(b.id)?.score ?? 0) - (rankedById.get(a.id)?.score ?? 0),
    );
    matchupSelect.replaceChildren(
      h("option", { value: "", selected: !matchupId }, "Choose a matchup…"),
      ...sorted.map((matchup) =>
        h("option", { value: matchup.id, selected: matchup.id === matchupId }, matchupLabel(matchup)),
      ),
    );
  };

  const renderSides = () => {
    const matchup = currentMatchup();
    if (!matchup || !sides || !first || !second) {
      sidesBox.replaceChildren(h("span", { class: "hint" }, "Choose a matchup to map the players."));
      return;
    }
    const byId = new Map(players.map((player) => [player.id, player]));
    const row = (scoliaId: string, alias: string | null) => [
      h("span", {}, byId.get(scoliaId) ? displayName(byId.get(scoliaId)!) : scoliaId),
      h("span", { class: "arrow" }, "→"),
      h("strong", {}, alias ?? "?"),
    ];
    sidesBox.replaceChildren(
      ...row(sides.player1, matchup.player1.alias),
      ...row(sides.player2, matchup.player2.alias),
    );
  };

  const renderHints = () => {
    const entry: RankedMatchup | undefined = rankedById.get(matchupId);
    const isGuess = suggestion.best && entry && entry.matchup.id === suggestion.best.matchup.id;
    guessHint.textContent = isGuess
      ? `Guessed from names: ${entry.pairs
          .map((pair) => `${pair.scoliaName} ≈ ${pair.alias} (${percent(pair.score)})`)
          .join(", ")}. Please check.`
      : "";

    const season = currentSeason();
    const problems = season ? configMismatches(game.configuration, season) : [];
    warning.hidden = problems.length === 0;
    warning.textContent = `This game doesn't match the season's rules: ${problems.join(", ")}. fusion-local will probably reject it.`;

    reportButton.disabled = !matchupId || !sides || invalidInputs.size > 0;
  };

  const render = () => {
    renderSeasons();
    renderMatchups();
    renderSides();
    renderHints();
  };

  seasonSelect.addEventListener("change", () => {
    seasonId = seasonSelect.value;
    matchupId = "";
    sides = null;
    render();
  });
  matchupSelect.addEventListener("change", () => {
    matchupId = matchupSelect.value;
    sides = matchupId ? (rankedById.get(matchupId)?.sides ?? defaultSides()) : null;
    render();
  });

  const swap = () => {
    if (sides) sides = { player1: sides.player2, player2: sides.player1 };
    render();
  };

  const dartsInput = (playerId: string, index: number, remaining: number) => {
    const min = minDarts(game.configuration.startScore - remaining);
    const input = h("input", {
      type: "number",
      min: String(min),
      step: "1",
      value: String(darts[playerId]?.[index] ?? ""),
      "aria-label": `Darts in leg ${index + 1}`,
    });
    input.addEventListener("input", () => {
      const value = Number(input.value);
      const valid = input.value !== "" && Number.isInteger(value) && value >= min;
      input.classList.toggle("invalid", !valid);
      input.title = valid ? "" : `At least ${min} darts are needed to score ${game.configuration.startScore - remaining}`;
      if (valid) {
        invalidInputs.delete(input);
        darts[playerId]![index] = value;
      } else {
        invalidInputs.add(input);
      }
      renderHints();
    });
    return input;
  };

  const legCount = Math.max(0, ...players.map((player) => legs[player.id]?.length ?? 0));
  const legsTable =
    first && second
      ? h(
          "table",
          {},
          h(
            "tr",
            {},
            h("th", {}, "Leg"),
            ...[first, second].map((player) => h("th", {}, `${displayName(player)}: darts / rest`)),
          ),
          ...Array.from({ length: legCount }, (_, index) =>
            h(
              "tr",
              {},
              h("td", {}, String(index + 1)),
              ...[first, second].map((player) => {
                const leg = legs[player.id]?.[index];
                return h(
                  "td",
                  {},
                  leg ? dartsInput(player.id, index, leg.remaining) : "–",
                  leg && h("span", { class: "rest" }, ` / ${leg.remaining}`),
                );
              }),
            ),
          ),
        )
      : null;

  const scoreLine =
    first && second
      ? `${displayName(first)} ${score[first.id] ?? 0} : ${score[second.id] ?? 0} ${displayName(second)}`
      : "";

  return new Promise<Awaited<ReturnType<MatchFlowUi["confirmResult"]>>>((resolve) => {
    const finish = (result: Awaited<ReturnType<MatchFlowUi["confirmResult"]>>) => () => {
      close();
      resolve(result);
    };
    reportButton.addEventListener("click", () => {
      if (matchupId && sides && invalidInputs.size === 0) finish({ matchupId, sides, darts })();
    });

    root.append(
      h(
        "div",
        { class: "backdrop" },
        h(
          "div",
          { class: "modal", role: "dialog", "aria-modal": "true" },
          h("h2", {}, "Report result to the darts season"),
          h("p", { class: "score" }, scoreLine),
          options.length === 0 &&
            h("p", { class: "warning" }, "There is no running season with open matchups."),
          h("label", { for: "season" }, "Season"),
          seasonSelect,
          h("label", { for: "matchup" }, "Matchup"),
          matchupSelect,
          guessHint,
          h("label", {}, "Players"),
          sidesBox,
          h("button", { class: "swap", onclick: swap }, "⇄ Swap players"),
          legsTable && h("label", {}, "Legs"),
          legsTable,
          legsTable &&
            h("p", { class: "hint" }, "Dart counts come from Scolia. Correct them here if Scolia counted wrong."),
          warning,
          h(
            "div",
            { class: "actions" },
            h("button", { onclick: finish("discard"), title: "Don't report this game" }, "Discard"),
            h("span", { class: "spacer" }),
            h("button", { onclick: finish("later"), title: "Ask again on the next page load" }, "Later"),
            reportButton,
          ),
        ),
      ),
    );
    render();
  });
};

let toastList: Promise<HTMLElement> | undefined;

const getToastList = () =>
  (toastList ??= mountShadow(TOAST_CSS).then(({ root }) => {
    const list = h("div", { class: "toasts", role: "status" });
    root.append(list);
    return list;
  }));

const showToast = async (
  kind: "success" | "error" | "warning",
  message: string,
  retry?: () => void,
) => {
  const list = await getToastList();
  const toast = h("div", { class: `toast ${kind}` });
  const dismiss = () => toast.remove();
  toast.append(h("span", {}, message));
  if (retry) {
    const onclick = () => {
      dismiss();
      retry();
    };
    toast.append(h("button", { onclick }, "Retry"));
  }
  toast.append(h("button", { onclick: dismiss, "aria-label": "Close" }, "×"));
  list.append(toast);
  // Errors stay until handled; everything else fades out on its own.
  if (kind !== "error") setTimeout(dismiss, kind === "success" ? 5_000 : 15_000);
};

export const createPageUi = (): MatchFlowUi => ({
  confirmResult: showConfirm,
  warnConfig: (message) => void showToast("warning", message),
  notify: (kind, message, retry) => void showToast(kind, message, retry),
});
