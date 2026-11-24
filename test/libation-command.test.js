import assert from "node:assert/strict";
import test from "node:test";
import { parseLibationCommand } from "../server/libation-command.js";

test("maps supported commands and options to explicit arguments", () => {
  assert.deepEqual(parseLibationCommand("list-accounts --bare"), { args: ["list-accounts", "--bare"] });
  assert.deepEqual(parseLibationCommand("libationcli scan"), { action: "scan" });
  assert.deepEqual(parseLibationCommand("liberate --force B000TEST01"), {
    action: "liberate", force: true, asin: "B000TEST01"
  });
  assert.deepEqual(parseLibationCommand("liberate"), { action: "liberate" });
});

test("routes external login through the guided flow", () => {
  assert.deepEqual(parseLibationCommand("login-external --locale de --account test@example.invalid"), {
    login: { account: "test@example.invalid", locale: "de" }
  });
});

test("rejects arbitrary executables, options, chained commands, and response URLs", () => {
  const rejected = [
    null, "", "x".repeat(513), "sh", "curl", "scan\nscan", "scan; scan", "scan | help",
    "scan --override Books=/tmp", "list-accounts --libationFiles /tmp", "liberate --help",
    "liberate --pdf --pdf", "liberate B000TEST01 B000TEST02", "liberate ../file",
    "login-external --account test@example.invalid --account duplicate@example.invalid",
    "login-external --account test@example.invalid --locale de --response-url https://example.invalid"
  ];
  for (const value of rejected) assert.equal(parseLibationCommand(value), null, String(value));
});
