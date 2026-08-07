import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export class ExclusiveJobQueue {
  constructor({ command, env, appendLog, createId = randomUUID, now = () => new Date().toISOString(), spawnProcess = spawn }) {
    this.command = command;
    this.env = env;
    this.appendLog = appendLog;
    this.createId = createId;
    this.now = now;
    this.spawnProcess = spawnProcess;
    this.jobs = new Map();
    this.pending = [];
    this.activeId = null;
  }

  start({ label, args, stdinText = null, queueIfBusy = false, action = null, asin = null, dedupeKey = null }) {
    const active = this.activeJob();
    if ((active || this.pending.length) && !queueIfBusy) {
      const conflicting = active || this.pending[0]?.job;
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
      logs: []
    };
    this.jobs.set(job.id, job);

    if (this.activeId) this.pending.push({ job, stdinText });
    else this.launch(job, stdinText);

    return job;
  }

  activeJob() {
    return this.activeId ? this.jobs.get(this.activeId) || null : null;
  }

  queuedJobs() {
    return this.pending.map(({ job }) => job);
  }

  queuePosition(jobId) {
    const index = this.pending.findIndex(({ job }) => job.id === jobId);
    return index === -1 ? null : index + 1;
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
    if (this.activeId === job.id) this.activeId = null;

    const next = this.pending.shift();
    if (next) this.launch(next.job, next.stdinText);
  }
}
