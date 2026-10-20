// Page UI for the match flow: the "report result" modal and toasts.

import type { Matchup, Season } from "./api";
import type { RankedMatchup } from "./matching";
import { configMismatches, type ConfirmRequest, type MatchFlowUi } from "./match-flow";
import { minDarts, type ScoliaPlayer, type Sides } from "./scolia";
import {
  alertWarning,
  button,
  dialog,
  fieldLabel,
  hint,
  inputSm,
  label,
  select,
  table,
  toast as toastClass,
} from "./ui/classes";
import { type Child, h, modal, modalHeader, mountShadow } from "./ui/shadow-modal";

const displayName = (player: ScoliaPlayer) => player.name ?? player.id;

const matchupLabel = (matchup: Matchup) =>
  `R${matchup.roundNumber} · ${matchup.player1.alias ?? "?"} vs ${matchup.player2.alias ?? "?"}`;

const percent = (score: number) => `${Math.round(score * 100)}%`;

const showConfirm = async (request: ConfirmRequest) => {
  const { root, close } = await mountShadow();
  const { players, options, suggestion, score, game, legs } = request;
  const [first, second] = players;
  const rankedById = new Map(suggestion.ranked.map((entry) => [entry.matchup.id, entry]));

  let seasonId = suggestion.best?.season.id ?? options[0]?.season.id ?? "";
  let matchupId = suggestion.best?.matchup.id ?? "";
  let sides: Sides | null = suggestion.best?.sides ?? null;

  const seasonSelect = h("select", { id: "season", class: select });
  const matchupSelect = h("select", { id: "matchup", class: select });
  const sidesBox = h("div", { class: "grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-1" });
  const guessHint = h("p", { class: `${hint} mt-2 empty:hidden` });
  const warning = h("div", { class: alertWarning, hidden: true });
  const reportButton = h("button", { class: button.primary }, "Report");

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
      sidesBox.replaceChildren(h("span", { class: `${hint} col-span-3` }, "Choose a matchup to map the players."));
      return;
    }
    const byId = new Map(players.map((player) => [player.id, player]));
    const row = (scoliaId: string, alias: string | null) => [
      h("span", {}, byId.get(scoliaId) ? displayName(byId.get(scoliaId)!) : scoliaId),
      h("span", { class: "text-muted-foreground" }, "→"),
      h("strong", { class: "font-medium" }, alias ?? "?"),
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
      class: inputSm,
      "aria-label": `Darts in leg ${index + 1}`,
    });
    input.addEventListener("input", () => {
      const value = Number(input.value);
      const valid = input.value !== "" && Number.isInteger(value) && value >= min;
      input.setAttribute("aria-invalid", String(!valid));
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
          { class: table.table },
          h(
            "tr",
            {},
            h("th", { class: table.th }, "Leg"),
            ...[first, second].map((player) =>
              h("th", { class: table.th }, `${displayName(player)}: darts / rest`),
            ),
          ),
          ...Array.from({ length: legCount }, (_, index) =>
            h(
              "tr",
              {},
              h("td", { class: table.td }, String(index + 1)),
              ...[first, second].map((player) => {
                const leg = legs[player.id]?.[index];
                return h(
                  "td",
                  { class: table.td },
                  leg ? dartsInput(player.id, index, leg.remaining) : "–",
                  leg && h("span", { class: "text-muted-foreground" }, ` / ${leg.remaining}`),
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

    const field = (...children: Child[]) => h("div", {}, ...children);

    root.append(
      modal(
        modalHeader("Report result to the darts season"),
        h("p", { class: "text-2xl font-semibold tabular-nums" }, scoreLine),
        options.length === 0 &&
          h("p", { class: alertWarning }, "There is no running season with open matchups."),
        field(h("label", { for: "season", class: fieldLabel }, "Season"), seasonSelect),
        field(h("label", { for: "matchup", class: fieldLabel }, "Matchup"), matchupSelect, guessHint),
        field(
          h(
            "div",
            { class: "mb-2 flex items-center justify-between" },
            h("span", { class: label }, "Players"),
            h("button", { class: button.ghostSm, onclick: swap }, "⇄ Swap"),
          ),
          sidesBox,
        ),
        legsTable &&
          field(
            h("span", { class: fieldLabel }, "Legs"),
            legsTable,
            h(
              "p",
              { class: `${hint} mt-2` },
              "Dart counts come from Scolia. Correct them here if Scolia counted wrong.",
            ),
          ),
        warning,
        h(
          "div",
          { class: `${dialog.footer} sm:items-center` },
          h(
            "button",
            { class: `${button.ghost} sm:mr-auto`, onclick: finish("discard"), title: "Don't report this game" },
            "Discard",
          ),
          h(
            "button",
            { class: button.outline, onclick: finish("later"), title: "Ask again on the next page load" },
            "Later",
          ),
          reportButton,
        ),
      ),
    );
    render();
  });
};

let toastList: Promise<HTMLElement> | undefined;

const getToastList = () =>
  (toastList ??= mountShadow().then(({ root }) => {
    const list = h("div", { class: toastClass.list, role: "status" });
    root.append(list);
    return list;
  }));

const showToast = async (
  kind: "success" | "error" | "warning",
  message: string,
  retry?: () => void,
) => {
  const list = await getToastList();
  const toast = h("div", { class: toastClass.item });
  const dismiss = () => toast.remove();
  toast.append(
    h("span", { class: toastClass.icon[kind], "aria-hidden": "true" }, kind === "success" ? "✓" : "!"),
    h("span", { class: "flex-1" }, message),
  );
  if (retry) {
    const onclick = () => {
      dismiss();
      retry();
    };
    toast.append(h("button", { class: button.outlineSm, onclick }, "Retry"));
  }
  toast.append(h("button", { class: button.ghostIcon, onclick: dismiss, "aria-label": "Close" }, "×"));
  list.append(toast);
  // Errors stay until handled; everything else fades out on its own.
  if (kind !== "error") setTimeout(dismiss, kind === "success" ? 5_000 : 15_000);
};

export const createPageUi = (): MatchFlowUi => ({
  confirmResult: showConfirm,
  warnConfig: (message) => void showToast("warning", message),
  notify: (kind, message, retry) => void showToast(kind, message, retry),
});
