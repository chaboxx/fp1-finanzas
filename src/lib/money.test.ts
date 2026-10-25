import assert from "node:assert/strict";
import { it } from "node:test";
import { centsToInput, parseToCents } from "./money";

it("formatea dos decimales sin redondear céntimos enteros", () => {
  for (const [cents, expected] of [
    [0, "0.00"],
    [1, "0.01"],
    [1550, "15.50"],
    [-1550, "-15.50"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91"],
  ] as const)
    assert.equal(centsToInput(cents), expected);
});

it("convierte montos sin signo a céntimos exactos", () => {
  for (const [input, expected] of [
    ["0", 0],
    ["0.00", 0],
    ["20", 2000],
    ["15.5", 1550],
    ["0.29", 29],
    ["12.", 1200],
    ["00012.30", 1230],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ] as const)
    assert.equal(parseToCents(input), expected, input);
});

it("rechaza negativos, texto, comas, exponentes y más de dos decimales", () => {
  for (const input of [
    "",
    ".",
    "abc",
    "10soles",
    "-10",
    "-0",
    "+10",
    "1e3",
    "15,50",
    "1,500.50",
    "S/ 20",
    " 20",
    "20 ",
    "1.234",
    "1.2.3",
    "90071992547409.92",
  ])
    assert.equal(parseToCents(input), null, input);
});
