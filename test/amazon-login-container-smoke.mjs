import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const image = process.env.LIBIKU_SMOKE_IMAGE || "libiku:verify";
const containerName = ["libiku-amazon-smoke", Date.now(), process.pid].join("-");
const smokeRoot = await mkdtemp(path.join(os.tmpdir(), "libiku-amazon-smoke-"));
const configDir = path.join(smokeRoot, "config");
const dbDir = path.join(smokeRoot, "db");
const dataDir = path.join(smokeRoot, "data");
const secretFile = path.join(configDir, "setup-secret.txt");
const fakeCliFile = path.join(configDir, "fake-libation");
const setupSecret = "synthetic-container-smoke-secret-2026";
const adminPassword = "Synthetic-Container-Smoke-Password-2026";
const responseMarker = "synthetic-container-response";
const fixtureFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-libation.sh");
const fakeCli = await readFile(fixtureFile, "utf8");

function docker(args, { allowFailure = false } = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 120_000 });
  if (!allowFailure && result.status !== 0) {
    throw new Error("docker " + args[0] + " failed: " + (result.stderr || result.stdout));
  }
  return result;
}

async function request(baseUrl, pathname, { cookie, headers = {}, method = "GET", body } = {}) {
  const response = await fetch(baseUrl + pathname, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000)
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null
  };
}

async function waitFor(check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the Amazon login smoke-test state.");
}

async function filesContain(directory, needle) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await filesContain(target, needle)) return true;
    } else if ((await readFile(target, "utf8")).includes(needle)) {
      return true;
    }
  }
  return false;
}

try {
  await Promise.all([mkdir(configDir), mkdir(dbDir), mkdir(dataDir)]);
  await Promise.all([chmod(configDir, 0o777), chmod(dbDir, 0o777), chmod(dataDir, 0o777)]);
  await writeFile(secretFile, setupSecret + "\n", { mode: 0o644 });
  await writeFile(fakeCliFile, fakeCli, { mode: 0o755 });
  await chmod(fakeCliFile, 0o755);

  docker([
    "run", "-d", "--name", containerName,
    "--read-only",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--cap-drop=ALL",
    "--security-opt", "no-new-privileges:true",
    "-p", "127.0.0.1::3000",
    "-e", "NODE_ENV=production",
    "-e", "PUBLIC_IP_URL=http://127.0.0.1:9",
    "-e", "ISHIKU_SETUP_SECRET_FILE=/config/setup-secret.txt",
    "-e", "LIBATION_CLI=/config/fake-libation",
    "--mount", "type=bind,source=" + configDir + ",target=/config",
    "--mount", "type=bind,source=" + dbDir + ",target=/db",
    "--mount", "type=bind,source=" + dataDir + ",target=/data",
    image
  ]);

  await waitFor(async () => {
    const result = docker(["inspect", "--format", "{{.State.Health.Status}}", containerName]);
    return result.stdout.trim() === "healthy";
  }, 45_000);

  const portResult = docker(["port", containerName, "3000/tcp"]);
  const portMatch = portResult.stdout.match(/127\.0\.0\.1:(\d+)/);
  assert.ok(portMatch, "container publishes an IPv4 loopback port");
  const baseUrl = "http://127.0.0.1:" + portMatch[1];

  const setup = await request(baseUrl, "/api/setup", {
    method: "POST",
    body: {
      setupSecret,
      displayName: "Container Smoke Admin",
      username: "containersmoke",
      email: "container-admin@example.invalid",
      password: adminPassword,
      passwordConfirm: adminPassword
    }
  });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie, "setup returns an authenticated session cookie");
  const sameOrigin = { Origin: baseUrl, "Sec-Fetch-Site": "same-origin" };

  const commandRequest = (command, options = {}) => request(baseUrl, "/api/commands", {
    cookie, headers: sameOrigin, method: "POST", body: { command }, ...options
  });
  assert.equal((await commandRequest("list-accounts", { cookie: undefined })).status, 401);
  assert.equal((await commandRequest("scan", {
    headers: { Origin: "https://example.invalid", "Sec-Fetch-Site": "cross-site" }
  })).status, 403);
  assert.equal((await commandRequest("scan --override Books=/tmp")).status, 400);
  const listed = await commandRequest("list-accounts");
  assert.equal(listed.status, 202);
  const listedJob = await waitFor(async () => {
    const result = await request(baseUrl, "/api/jobs/" + listed.body.id, { cookie });
    return result.body.status === "succeeded" ? result.body : null;
  });
  assert.match(listedJob.logs.map((entry) => entry.line).join("\n"), /No accounts configured/);

  const download = await commandRequest("liberate B000TEST01 --force");
  assert.equal(download.status, 202);
  assert.equal(download.body.action, "liberate");
  assert.equal(download.body.asin, "B000TEST01");
  const downloadedJob = await waitFor(async () => {
    const result = await request(baseUrl, "/api/jobs/" + download.body.id, { cookie });
    return result.body.status === "succeeded" ? result.body : null;
  });
  assert.match(downloadedJob.logs.map((entry) => entry.line).join("\n"), /Synthetic CLI arguments: liberate --force B000TEST01/);

  const started = await request(baseUrl, "/api/accounts/login-external", {
    cookie,
    headers: sameOrigin,
    method: "POST",
    body: { account: "container-smoke@example.invalid", locale: "de" }
  });
  assert.equal(started.status, 202);
  const jobId = started.body.id;
  const awaiting = await waitFor(async () => {
    const result = await request(baseUrl, "/api/jobs/" + jobId, { cookie });
    return result.body.phase === "awaiting-response" ? result.body : null;
  });
  assert.match(awaiting.loginUrl, /^https:\/\/www\.amazon\.de\//);
  const preSubmitLogs = awaiting.logs.map((entry) => entry.line).join("\n");
  assert.doesNotMatch(preSubmitLogs, /https:\/\/[^\s]*amazon\./i);
  assert.match(preSubmitLogs, /\[Amazon authentication URL hidden\]/);

  const unsafe = await request(baseUrl, "/api/accounts/login-external/" + jobId + "/complete", {
    cookie,
    headers: sameOrigin,
    method: "POST",
    body: { responseUrl: "https://evil.example/ap/maplanding?code=synthetic" }
  });
  assert.equal(unsafe.status, 400);
  const afterUnsafe = await request(baseUrl, "/api/jobs/" + jobId, { cookie });
  assert.equal(afterUnsafe.body.phase, "awaiting-response");

  const crossSite = await request(baseUrl, "/api/accounts/login-external/" + jobId + "/complete", {
    cookie,
    headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    method: "POST",
    body: { responseUrl: "https://www.amazon.de/ap/maplanding?code=" + responseMarker }
  });
  assert.equal(crossSite.status, 403);

  const completed = await request(baseUrl, "/api/accounts/login-external/" + jobId + "/complete", {
    cookie,
    headers: sameOrigin,
    method: "POST",
    body: { responseUrl: "https://www.amazon.de/ap/maplanding?code=" + responseMarker }
  });
  assert.equal(completed.status, 202);
  const processList = docker(["top", containerName, "-eo", "pid,args"]).stdout;
  assert.doesNotMatch(processList, new RegExp(responseMarker));

  const finished = await waitFor(async () => {
    const result = await request(baseUrl, "/api/jobs/" + jobId, { cookie });
    return result.body.status !== "running" ? result.body : null;
  });
  assert.equal(finished.status, "succeeded");
  assert.equal(finished.phase, "completed");
  assert.doesNotMatch(finished.logs.map((entry) => entry.line).join("\n"), new RegExp(responseMarker));
  assert.equal(await filesContain(configDir, responseMarker), false);

  const accounts = await request(baseUrl, "/api/accounts", { cookie });
  assert.equal(accounts.status, 200);
  assert.equal(accounts.body.accounts.length, 1);
  assert.equal(accounts.body.accounts[0].authenticated, true);

  const commandLogin = await commandRequest("login-external --account test@example.invalid --locale de");
  assert.equal(commandLogin.status, 202);
  assert.equal(commandLogin.body.kind, "amazon-login");
  assert.equal((await request(baseUrl, "/api/accounts/login-external/" + commandLogin.body.id + "/cancel", {
    cookie, headers: sameOrigin, method: "POST"
  })).status, 202);

  console.log(JSON.stringify({
    status: "passed",
    image,
    command_window: "passed",
    response_url_in_process_args: false,
    response_url_in_logs: false,
    response_url_persisted: false
  }));
} finally {
  docker(["rm", "-f", containerName], { allowFailure: true });
  await rm(smokeRoot, { recursive: true, force: true });
}
