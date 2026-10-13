import assert from "node:assert/strict";
import { test } from "node:test";
import { MATCH_THRESHOLD, similarity, suggestMatchup } from "../src/matching";
import { matchup, season } from "./fixtures";

test("a nickname containing the alias as a token scores 0.9", () => {
  assert.equal(similarity("Chaoslordi | David", "Chaoslordi"), 0.9);
});

test("identical names ignore case and diacritics", () => {
  assert.equal(similarity("Jürgen", "JURGEN"), 1);
});

test("a substring of at least 4 characters scores 0.8", () => {
  assert.equal(similarity("xChaoslordi", "Chaoslordi"), 0.8);
});

test("a typo still matches", () => {
  assert.ok(similarity("Chaoslordy", "Chaoslordi") >= MATCH_THRESHOLD);
});

test("unrelated names and missing names score 0", () => {
  assert.equal(similarity("Roskato", "Stocki"), 0);
  assert.equal(similarity(null, "Stocki"), 0);
  assert.equal(similarity("Roskato", null), 0);
});

test("the best matchup is suggested with the matching orientation", () => {
  const players = [
    { id: "a", name: "Roskato" },
    { id: "b", name: "Chaoslordi | David" },
  ];
  const { best } = suggestMatchup(players, [
    { season, matchups: [matchup("m1", "Chaoslordi", "Roskato"), matchup("m2", "Chaoslordi", "Stocki")] },
  ]);
  assert.equal(best?.matchup.id, "m1");
  assert.deepEqual(best?.sides, { player1: "b", player2: "a" });
});

test("two equally likely matchups give no suggestion", () => {
  const players = [
    { id: "a", name: "Roskato" },
    { id: "b", name: "Chaoslordi" },
  ];
  const { best, ranked } = suggestMatchup(players, [
    // Both rounds of a double round robin have the same pairing.
    { season, matchups: [matchup("r1", "Chaoslordi", "Roskato"), matchup("r2", "Roskato", "Chaoslordi")] },
  ]);
  assert.equal(best, null);
  assert.equal(ranked.length, 2);
});

test("guests without names get no suggestion", () => {
  const players = [
    { id: "Player 1", name: null },
    { id: "Player 2", name: null },
  ];
  const { best } = suggestMatchup(players, [{ season, matchups: [matchup("m1", "Chaoslordi", "Roskato")] }]);
  assert.equal(best, null);
});
