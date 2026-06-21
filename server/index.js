import fs from "node:fs/promises";
import fssync from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const config = {
  port: Number(process.env.PORT || 3000),
  libationCli: process.env.LIBATION_CLI || "/libation/LibationCli",
  libationFilesDir: process.env.LIBATION_FILES_DIR || process.env.LIBATION_CONFIG_DIR || "/config",
  dbDir: process.env.LIBATION_DB_DIR || "/db",
  dbFile: process.env.LIBATION_DB_FILE || "",
  booksDir: process.env.LIBATION_BOOKS_DIR || "/data",
  publicIpUrl: process.env.PUBLIC_IP_URL || "https://api.ipify.org?format=json",
  publicIpIntervalSeconds: Number(process.env.PUBLIC_IP_INTERVAL_SECONDS || 300)
};

const jobs = new Map();
const maxLogLines = 1200;
let publicIpCache = {
  ip: null,
  raw: null,
  checkedAt: null,
  error: null
};

const publicDir = path.join(appRoot, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function nowIso() {
  return new Date().toISOString();
}

function appendLog(job, stream, chunk) {
  const text = chunk.toString("utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    job.logs.push({ at: nowIso(), stream, line });
  }
  if (job.logs.length > maxLogLines) {
    job.logs.splice(0, job.logs.length - maxLogLines);
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  }
}

async function readJsonFile(filePath, fallback = {}) {
  try {
    const raw = stripBom(await fs.readFile(filePath, "utf8"));
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

async function writeJsonFile(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function initializeLibationFiles() {
  await Promise.all([ensureDir(config.libationFilesDir), ensureDir(config.dbDir), ensureDir(config.booksDir)]);
  await ensureJsonFile(path.join(config.libationFilesDir, "Settings.json"), {});
  await ensureJsonFile(path.join(config.libationFilesDir, "AccountsSettings.json"), {});

  const settingsPath = path.join(config.libationFilesDir, "Settings.json");
  const settings = await readJsonFile(settingsPath, {}).catch((error) => {
    console.error(`Settings.json could not be parsed during startup: ${error.message}`);
    return {};
  });
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    console.error("Settings.json is not a JSON object; startup defaults were skipped.");
    return;
  }
  let changed = false;
  if (!settings.Books) {
    settings.Books = config.booksDir;
    changed = true;
  }
  if (!settings.InProgress) {
    settings.InProgress = "/tmp";
    changed = true;
  }
  if (changed) await writeJsonFile(settingsPath, settings);
}

function findDbPath() {
  const candidates = [];
  if (config.dbFile) candidates.push(path.join(config.dbDir, config.dbFile));
  candidates.push(path.join(config.dbDir, "LibationContext.db"));
  candidates.push(path.join(config.libationFilesDir, "LibationContext.db"));

  for (const candidate of candidates) {
    if (fssync.existsSync(candidate) && fssync.statSync(candidate).isFile()) return candidate;
  }

  for (const dir of [config.dbDir, config.libationFilesDir]) {
    if (!fssync.existsSync(dir)) continue;
    const match = fssync.readdirSync(dir).find((name) => name.toLowerCase().endsWith(".db"));
    if (match) return path.join(dir, match);
  }

  return null;
}

function cliArgs(args) {
  return ["--libationFiles", config.libationFilesDir, ...args];
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        LIBATION_FILES_DIR: config.libationFilesDir,
        LIBATION_CONFIG_DIR: config.libationFilesDir,
        LIBATION_BOOKS_DIR: config.booksDir
      },
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function startJob(label, args, stdinText = null) {
  const conflicting = [...jobs.values()].find((job) => job.status === "running" && job.exclusive);
  if (conflicting) {
    const error = new Error(`Another Libation job is already running: ${conflicting.label}`);
    error.status = 409;
    throw error;
  }

  const id = randomUUID();
  const job = {
    id,
    label,
    command: config.libationCli,
    args: cliArgs(args),
    exclusive: true,
    status: "running",
    exitCode: null,
    signal: null,
    startedAt: nowIso(),
    finishedAt: null,
    logs: []
  };
  jobs.set(id, job);

  const child = spawn(config.libationCli, job.args, {
    env: {
      ...process.env,
      LIBATION_FILES_DIR: config.libationFilesDir,
      LIBATION_CONFIG_DIR: config.libationFilesDir,
      LIBATION_BOOKS_DIR: config.booksDir
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  job.pid = child.pid;
  child.stdout.on("data", (chunk) => appendLog(job, "stdout", chunk));
  child.stderr.on("data", (chunk) => appendLog(job, "stderr", chunk));
  child.on("error", (error) => {
    job.status = "failed";
    job.finishedAt = nowIso();
    appendLog(job, "error", Buffer.from(error.message));
  });
  child.on("close", (code, signal) => {
    job.exitCode = code;
    job.signal = signal;
    job.status = code === 0 ? "succeeded" : "failed";
    job.finishedAt = nowIso();
  });

  if (stdinText) child.stdin.end(stdinText);
  else child.stdin.end();

  return job;
}

async function sqliteJson(dbPath, sql) {
  const result = await runProcess("sqlite3", ["-readonly", "-json", dbPath, sql]);
  if (result.code !== 0) {
    const error = new Error(result.stderr || result.stdout || "sqlite3 failed");
    error.status = 500;
    throw error;
  }
  const output = result.stdout.trim();
  return output ? JSON.parse(output) : [];
}

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

async function tableInfo(dbPath, table) {
  return sqliteJson(dbPath, `PRAGMA table_info('${sqlString(table)}');`);
}

async function tableExists(dbPath, table) {
  const rows = await sqliteJson(
    dbPath,
    `select name from sqlite_master where type in ('table','view') and name='${sqlString(table)}' limit 1;`
  );
  return rows.length > 0;
}

async function dbSchema(dbPath) {
  const tables = await sqliteJson(
    dbPath,
    "select name, type from sqlite_master where type in ('table','view') order by name;"
  );
  const schema = {};
  for (const table of tables) {
    schema[table.name] = await tableInfo(dbPath, table.name);
  }
  return { dbPath, tables, schema };
}

function selectColumn(columns, tableAlias, name, alias = name, fallback = "null") {
  return columns.has(name) ? `${tableAlias}."${name}" as "${alias}"` : `${fallback} as "${alias}"`;
}

async function libraryQuery({ search = "", status = "all", limit = 100, offset = 0 }) {
  const dbPath = findDbPath();
  if (!dbPath) return { dbPath: null, items: [], total: 0, warning: "No Libation database found yet." };

  const hasBooks = await tableExists(dbPath, "Books");
  const hasLibraryBooks = await tableExists(dbPath, "LibraryBooks");
  const hasLibrary = await tableExists(dbPath, "Library");
  if (!hasBooks || (!hasLibraryBooks && !hasLibrary)) {
    return { dbPath, items: [], total: 0, warning: "Known Libation library tables were not found." };
  }

  const bookCols = new Set((await tableInfo(dbPath, "Books")).map((c) => c.name));
  const userCols = (await tableExists(dbPath, "UserDefinedItem"))
    ? new Set((await tableInfo(dbPath, "UserDefinedItem")).map((c) => c.name))
    : new Set();
  const userJoin = userCols.size ? 'left join "UserDefinedItem" udi on udi."BookId" = b."BookId"' : "";
  const libraryTable = hasLibraryBooks ? "LibraryBooks" : "Library";
  const libraryCols = new Set((await tableInfo(dbPath, libraryTable)).map((c) => c.name));

  const where = [];
  if (search.trim()) {
    const term = sqlString(`%${search.trim().toLowerCase()}%`);
    where.push(`(
      lower(b."Title") like '${term}'
      or lower(coalesce(b."AudibleProductId", '')) like '${term}'
      or lower(coalesce(contrib.names, '')) like '${term}'
      or lower(coalesce(series.names, '')) like '${term}'
    )`);
  }
  if (status !== "all" && userCols.has("BookStatus")) {
    const statusMap = { missing: 0, downloaded: 1, error: 2 };
    if (Object.hasOwn(statusMap, status)) where.push(`coalesce(udi."BookStatus", 0) = ${statusMap[status]}`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const countRows = await sqliteJson(
    dbPath,
    `
    select count(1) as total
    from "${libraryTable}" l
    join "Books" b on b."BookId" = l."BookId"
    ${userJoin}
    left join (
      select bc."BookId", group_concat(c."Name", ', ') as names
      from "BookContributor" bc
      join "Contributors" c on c."ContributorId" = bc."ContributorId"
      group by bc."BookId"
    ) contrib on contrib."BookId" = b."BookId"
    left join (
      select sb."BookId", group_concat(s."Name", ', ') as names
      from "SeriesBook" sb
      join "Series" s on s."SeriesId" = sb."SeriesId"
      group by sb."BookId"
    ) series on series."BookId" = b."BookId"
    ${whereSql};
    `
  );

  const rows = await sqliteJson(
    dbPath,
    `
    select
      b."BookId" as "bookId",
      ${selectColumn(bookCols, "b", "AudibleProductId", "asin", "''")},
      ${selectColumn(bookCols, "b", "Title", "title", "''")},
      ${selectColumn(bookCols, "b", "Subtitle", "subtitle", "''")},
      ${selectColumn(bookCols, "b", "Locale", "locale", "''")},
      ${selectColumn(bookCols, "b", "Language", "language", "''")},
      ${selectColumn(bookCols, "b", "LengthInMinutes", "lengthInMinutes", "0")},
      ${selectColumn(bookCols, "b", "PictureLarge", "cover", "null")},
      ${selectColumn(bookCols, "b", "PictureId", "pictureId", "null")},
      ${selectColumn(libraryCols, "l", "Account", "account", "''")},
      ${selectColumn(libraryCols, "l", "DateAdded", "dateAdded", "null")},
      ${selectColumn(libraryCols, "l", "IsDeleted", "isDeleted", "0")},
      ${selectColumn(userCols, "udi", "BookStatus", "bookStatus", "0")},
      ${selectColumn(userCols, "udi", "PdfStatus", "pdfStatus", "null")},
      ${selectColumn(userCols, "udi", "BookLocation", "bookLocation", "null")},
      ${selectColumn(userCols, "udi", "LastDownloaded", "lastDownloaded", "null")},
      coalesce(contrib.names, '') as "contributors",
      coalesce(series.names, '') as "series"
    from "${libraryTable}" l
    join "Books" b on b."BookId" = l."BookId"
    ${userJoin}
    left join (
      select bc."BookId", group_concat(c."Name", ', ') as names
      from "BookContributor" bc
      join "Contributors" c on c."ContributorId" = bc."ContributorId"
      group by bc."BookId"
    ) contrib on contrib."BookId" = b."BookId"
    left join (
      select sb."BookId", group_concat(s."Name", ', ') as names
      from "SeriesBook" sb
      join "Series" s on s."SeriesId" = sb."SeriesId"
      group by sb."BookId"
    ) series on series."BookId" = b."BookId"
    ${whereSql}
    order by lower(b."Title")
    limit ${safeLimit} offset ${safeOffset};
    `
  );

  return { dbPath, items: rows, total: countRows[0]?.total || 0 };
}

async function refreshPublicIp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(config.publicIpUrl, { signal: controller.signal });
    const text = await response.text();
    let ip = text.trim();
    let raw = text;
    try {
      const parsed = JSON.parse(text);
      raw = parsed;
      ip = parsed.ip || parsed.query || parsed.address || text.trim();
    } catch {
      // Plain text IP endpoints are fine.
    }
    publicIpCache = { ip, raw, checkedAt: nowIso(), error: null };
  } catch (error) {
    publicIpCache = { ...publicIpCache, checkedAt: nowIso(), error: error.message };
  } finally {
    clearTimeout(timer);
  }
  return publicIpCache;
}

function serializeJob(job, includeLogs = false) {
  return {
    id: job.id,
    label: job.label,
    status: job.status,
    exitCode: job.exitCode,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    pid: job.pid,
    logs: includeLogs ? job.logs : undefined
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendError(res, error) {
  const status = error.status || 500;
  sendJson(res, status, {
    error: error.message || "Internal server error",
    status
  });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) {
      const error = new Error("Request body is too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : {};
}

async function getStatusPayload() {
  const dbPath = findDbPath();
  const version = await getLibationVersion();
  return {
    app: "ish-libation",
    libationVersion: version,
    paths: {
      libationFilesDir: config.libationFilesDir,
      dbDir: config.dbDir,
      dbPath,
      booksDir: config.booksDir
    },
    publicIp: publicIpCache,
    runningJobs: [...jobs.values()].filter((job) => job.status === "running").map((job) => serializeJob(job))
  };
}

async function getLibationVersion() {
  const result = await runProcess(config.libationCli, ["--help"]).catch(() => null);
  const output = `${result?.stdout || ""}\n${result?.stderr || ""}`;
  const match = output.match(/LibationCli\s+v?[\d.]+/i);
  return match?.[0] || "Libation CLI";
}

async function createJobFromBody(body) {
  const { action, asin, force, pdf, downloaded, notDownloaded } = body || {};
  let label;
  let args;

  switch (action) {
    case "scan":
      label = "Refresh library";
      args = ["scan"];
      break;
    case "liberate":
      label = asin ? `Liberate ${asin}` : "Liberate all";
      args = ["liberate"];
      if (pdf) args.push("--pdf");
      if (force) args.push("--force");
      if (asin) args.push(String(asin));
      break;
    case "convert":
      label = "Convert";
      args = ["convert"];
      break;
    case "set-status":
      label = "Refresh download status";
      args = ["set-status"];
      if (downloaded !== false) args.push("--downloaded");
      if (notDownloaded !== false) args.push("--not-downloaded");
      if (asin) args.push(String(asin));
      break;
    default:
      {
        const error = new Error("Unknown action");
        error.status = 400;
        throw error;
      }
  }

  return startJob(label, args);
}

async function getAccountsPayload() {
  const result = await runProcess(config.libationCli, cliArgs(["list-accounts", "--bare"]));
  const accounts = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().includes("no accounts configured"))
    .map((line) => {
      const [id, name, locale, scanLibrary, authenticated] = line.split(/\t/);
      return {
        id,
        name,
        locale,
        scanLibrary: scanLibrary === "yes",
        authenticated: authenticated === "yes"
      };
    });
  return { accounts, raw: result.stdout, error: result.code === 0 ? null : result.stderr };
}

function createLoginJob(body) {
  const { account, locale, responseUrl } = body || {};
  if (!account || !locale) {
    const error = new Error("account and locale are required");
    error.status = 400;
    throw error;
  }
  const args = ["login-external", "--account", String(account), "--locale", String(locale)];
  if (responseUrl) args.push("--response-url", String(responseUrl));
  return startJob(`Login ${account} (${locale})`, args);
}

async function createImportJob(body) {
  const { json } = body || {};
  if (!json) {
    const error = new Error("json is required");
    error.status = 400;
    throw error;
  }
  JSON.parse(json);
  const importPath = path.join(config.libationFilesDir, `account-import-${Date.now()}.json`);
  await fs.writeFile(importPath, json, "utf8");
  return startJob("Import account", ["import-account", importPath]);
}

async function getSettingsPayload() {
  const settingsPath = path.join(config.libationFilesDir, "Settings.json");
  const accountsPath = path.join(config.libationFilesDir, "AccountsSettings.json");
  return {
    settings: await readJsonFile(settingsPath, {}),
    accountsSettings: await readJsonFile(accountsPath, {}),
    files: { settingsPath, accountsPath }
  };
}

async function saveSettingsFile(fileKey, body) {
  const allowed = {
    settings: "Settings.json",
    accounts: "AccountsSettings.json"
  };
  const file = allowed[fileKey];
  if (!file) {
    const error = new Error("Unknown settings file");
    error.status = 404;
    throw error;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Body must be a JSON object");
    error.status = 400;
    throw error;
  }
  const filePath = path.join(config.libationFilesDir, file);
  await writeJsonFile(filePath, body);
  return { ok: true, filePath };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, at: nowIso() });
  }

  if (method === "GET" && pathname === "/api/status") {
    return sendJson(res, 200, await getStatusPayload());
  }

  if (method === "GET" && pathname === "/api/public-ip") {
    if (url.searchParams.get("refresh") === "1") await refreshPublicIp();
    return sendJson(res, 200, publicIpCache);
  }

  if (method === "GET" && pathname === "/api/jobs") {
    const payload = [...jobs.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((job) => serializeJob(job));
    return sendJson(res, 200, payload);
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (method === "GET" && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) return sendJson(res, 404, { error: "Job not found" });
    return sendJson(res, 200, serializeJob(job, true));
  }

  if (method === "POST" && pathname === "/api/jobs") {
    const job = await createJobFromBody(await readJsonBody(req));
    return sendJson(res, 202, serializeJob(job, true));
  }

  if (method === "GET" && pathname === "/api/accounts") {
    return sendJson(res, 200, await getAccountsPayload());
  }

  if (method === "POST" && pathname === "/api/accounts/login-external") {
    const job = createLoginJob(await readJsonBody(req));
    return sendJson(res, 202, serializeJob(job, true));
  }

  if (method === "POST" && pathname === "/api/accounts/import") {
    const job = await createImportJob(await readJsonBody(req));
    return sendJson(res, 202, serializeJob(job, true));
  }

  if (method === "GET" && pathname === "/api/library") {
    const result = await libraryQuery({
      search: String(url.searchParams.get("search") || ""),
      status: String(url.searchParams.get("status") || "all"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset")
    });
    return sendJson(res, 200, result);
  }

  if (method === "GET" && pathname === "/api/db/schema") {
    const dbPath = findDbPath();
    if (!dbPath) return sendJson(res, 404, { error: "No database found" });
    return sendJson(res, 200, await dbSchema(dbPath));
  }

  if (method === "GET" && pathname === "/api/settings") {
    return sendJson(res, 200, await getSettingsPayload());
  }

  const settingsMatch = pathname.match(/^\/api\/settings\/([^/]+)$/);
  if (method === "PUT" && settingsMatch) {
    const payload = await saveSettingsFile(settingsMatch[1], await readJsonBody(req));
    return sendJson(res, 200, payload);
  }

  sendJson(res, 404, { error: "API endpoint not found" });
}

async function serveStatic(req, res, url) {
  const rawPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const requested = path.resolve(publicDir, `.${rawPath}`);
  if (!requested.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  let filePath = requested;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(publicDir, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream"
  });
  fssync.createReadStream(filePath).pipe(res);
}

await initializeLibationFiles();
await refreshPublicIp();
setInterval(refreshPublicIp, Math.max(60, config.publicIpIntervalSeconds) * 1000).unref();

http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    sendError(res, error);
  }
}).listen(config.port, () => {
  console.log(`ish-libation listening on :${config.port}`);
});
