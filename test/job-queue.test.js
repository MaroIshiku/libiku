import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { ExclusiveJobQueue } from "../server/job-queue.js";

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = { end() {} };
  }
}

function fixture() {
  const children = [];
  const jobs = new Map();
  let id = 0;
  let tick = 0;
  const queue = new ExclusiveJobQueue({
    command: "LibationCli",
    jobs,
    env: () => ({ TEST: "1" }),
    appendLog(job, stream, chunk) {
      job.logs.push({ stream, line: chunk.toString("utf8") });
    },
    createId: () => `job-${++id}`,
    now: () => `2026-08-07T00:00:0${tick++}.000Z`,
    spawnProcess(command, args, options) {
      const child = new FakeChild(1000 + children.length);
      children.push({ child, command, args, options });
      return child;
    }
  });
  return { queue, children, jobs };
}

function audiobook(asin) {
  return {
    label: `Liberate ${asin}`,
    args: ["liberate", asin],
    action: "liberate",
    asin,
    queueIfBusy: true,
    dedupeKey: `liberate:${asin}`
  };
}

test("runs queued audiobook downloads in FIFO order", () => {
  const { queue, children } = fixture();
  const first = queue.start(audiobook("B000000001"));
  const second = queue.start(audiobook("B000000002"));
  const third = queue.start(audiobook("B000000003"));

  assert.equal(first.status, "running");
  assert.equal(second.status, "queued");
  assert.equal(third.status, "queued");
  assert.equal(queue.queuePosition(second.id), 1);
  assert.equal(queue.queuePosition(third.id), 2);
  assert.equal(children.length, 1);

  children[0].child.emit("close", 0, null);
  assert.equal(first.status, "succeeded");
  assert.equal(second.status, "running");
  assert.equal(queue.queuePosition(third.id), 1);
  assert.deepEqual(children[1].args, ["liberate", "B000000002"]);

  children[1].child.emit("close", 0, null);
  assert.equal(third.status, "running");
  assert.deepEqual(children[2].args, ["liberate", "B000000003"]);
});

test("rejects a duplicate active or queued audiobook", () => {
  const { queue } = fixture();
  queue.start(audiobook("B000000001"));
  assert.throws(() => queue.start(audiobook("B000000001")), (error) => error.status === 409);
});

test("keeps non-queue jobs exclusive", () => {
  const { queue } = fixture();
  queue.start(audiobook("B000000001"));
  assert.throws(
    () => queue.start({ label: "Refresh library", args: ["scan"] }),
    (error) => error.status === 409
  );
});

test("advances the queue after a process error and ignores a later close", () => {
  const { queue, children } = fixture();
  const first = queue.start(audiobook("B000000001"));
  const second = queue.start(audiobook("B000000002"));

  children[0].child.emit("error", new Error("spawn failed"));
  children[0].child.emit("close", -1, null);

  assert.equal(first.status, "failed");
  assert.match(first.logs[0].line, /spawn failed/);
  assert.equal(second.status, "running");
  assert.equal(children.length, 2);
});

test("waits for an external login job before starting queued downloads", () => {
  const { queue, children, jobs } = fixture();
  jobs.set("amazon-login", { id: "amazon-login", status: "running" });

  const download = queue.start(audiobook("B000000001"));

  assert.equal(download.status, "queued");
  assert.equal(children.length, 0);

  jobs.get("amazon-login").status = "succeeded";
  queue.resume();

  assert.equal(download.status, "running");
  assert.equal(children.length, 1);
});
