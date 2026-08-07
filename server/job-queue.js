import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export class ExclusiveJobQueue {
  constructor({
    command,
    env,
    appendLog,
    jobs = new Map(),
    onFinish = () => {},
    createId = randomUUID,
    now = () => new Date().toISOString(),
    spawnProcess = spawn
  }) {
    this.command = command;
    this.env = env;
    this.appendLog = appendLog;
    this.onFinish = onFinish;
    this.createId = createId;
    this.now = now;
    this.spawnProcess = spawnProcess;
    this.jobs = jobs;
    this.managedIds = new Set();
    this.pending = [];
    this.activeId = null;
  }

  start({ label, args, stdinText = null, queueIfBusy = false, action = null, asin = null, dedupeKey = null }) {
    const active = this.activeJob();
    const external = this.externalActiveJob();
    if ((active || external || this.pending.length) && !queueIfBusy) {
      const conflicting = active || external || this.pending[0]?.job;
      const error = new Error(`Another Libation job is already running: ${conflicting?.label || "queued job"}`);
      error.status = 409;
      throw error;
    }

    if (dedupeKey) {
      const duplicate = [...this.jobs.values()].find(
        (job) => job.dedupeKey === dedupeKey && ["queued", "running"].includes(job.status)
      );
      if (duplicate) {
        const error = new Error(`${duplicate.label} is already ${duplicate.status}.`);
        error.status = 409;
        throw error;
      }
    }

    const job = {
      id: this.createId(),
      label,
      command: this.command,
      args: [...args],
      exclusive: true,
      action,
      asin,
      dedupeKey,
      status: "queued",
      exitCode: null,
      signal: null,
      queuedAt: this.now(),
      startedAt: null,
      finishedAt: null,
      pid: null,
      logs: [],
      logBuffers: {}
    };
    this.jobs.set(job.id, job);
    this.managedIds.add(job.id);

    if (this.activeId || external) this.pending.push({ job, stdinText });
    else this.launch(job, stdinText);

    return job;
  }

  activeJob() {
    return this.activeId ? this.jobs.get(this.activeId) || null : null;
  }

  externalActiveJob() {
    return [...this.jobs.values()].find(
      (job) => job.status === "running" && !this.managedIds.has(job.id)
    ) || null;
  }

  hasBlockingWork() {
    return Boolean(this.activeJob() || this.externalActiveJob() || this.pending.length);
  }

  queuedJobs() {
    return this.pending.map(({ job }) => job);
  }

  queuePosition(jobId) {
    const index = this.pending.findIndex(({ job }) => job.id === jobId);
    return index === -1 ? null : index + 1;
  }

  resume() {
    if (this.activeId || this.externalActiveJob()) return;
    const next = this.pending.shift();
    if (next) this.launch(next.job, next.stdinText);
  }

  launch(job, stdinText) {
    this.activeId = job.id;
    job.status = "running";
    job.startedAt = this.now();

    let child;
    try {
      child = this.spawnProcess(job.command, job.args, {
        env: this.env(),
        stdio: ["pipe", "pipe", "pipe"]
      });
      job.pid = child.pid ?? null;
    } catch (error) {
      this.finish(job, { status: "failed", error });
      return;
    }

    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      this.finish(job, result);
    };

    child.stdout?.on("data", (chunk) => this.appendLog(job, "stdout", chunk));
    child.stderr?.on("data", (chunk) => this.appendLog(job, "stderr", chunk));
    child.on("error", (error) => settle({ status: "failed", error }));
    child.on("close", (code, signal) => settle({
      status: code === 0 ? "succeeded" : "failed",
      code,
      signal
    }));

    try {
      if (stdinText) child.stdin.end(stdinText);
      else child.stdin.end();
    } catch (error) {
      settle({ status: "failed", error });
    }
  }

  finish(job, { status, code = null, signal = null, error = null }) {
    job.exitCode = code;
    job.signal = signal;
    job.status = status;
    job.finishedAt = this.now();
    if (error) this.appendLog(job, "error", Buffer.from(error.message));
    this.onFinish(job);
    if (this.activeId === job.id) this.activeId = null;
    this.resume();
  }
}
