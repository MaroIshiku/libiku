#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const command = process.argv[2];
const args = process.argv.slice(3);
const ignoredDirectories = new Set(['.git', '.tools', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache', '.venv', 'vendor']);

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseConfig(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} must be JSON-compatible YAML: ${error.message}`);
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Raw(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sha256(file) {
  const body = readFileSync(file);
  const normalized = body.includes(0)
    ? body
    : Buffer.from(body.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
  return createHash('sha256').update(normalized).digest('hex');
}

function matchesSha(file, expected) {
  return sha256(file) === expected || sha256Raw(file) === expected;
}

function walk(root, predicate = () => true) {
  if (!existsSync(root)) return [];
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(full, predicate));
    else if (entry.isFile() && predicate(full)) result.push(full);
  }
  return result;
}

function inside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function check(condition, id, message, bucket) {
  bucket.push({ id, outcome: condition ? 'pass' : 'fail', message });
  return condition;
}

function kitSource() {
  const centralCandidate = resolve(scriptDir, '..');
  if (existsSync(join(centralCandidate, 'version.yaml')) && existsSync(join(centralCandidate, 'policies'))) {
    return { kit: centralCandidate, workspace: resolve(centralCandidate, '..') };
  }
  return { kit: resolve(scriptDir, '..'), workspace: null };
}

function readWorkspace(appRoot, checks) {
  const file = join(appRoot, 'workspace.yaml');
  check(existsSync(file), 'WORKSPACE-001', 'workspace.yaml exists', checks);
  if (!existsSync(file)) return null;
  let data;
  try { data = parseConfig(file); } catch (error) {
    checks.push({ id: 'WORKSPACE-002', outcome: 'fail', message: error.message });
    return null;
  }
  check(data.schema_version === 1, 'WORKSPACE-002', 'workspace schema version is 1', checks);
  check(/^[a-z][a-z0-9-]{1,31}$/.test(data.application?.id ?? ''), 'WORKSPACE-003', 'application id is valid', checks);
  check(data.repository?.path === 'repository', 'WORKSPACE-004', 'repository path is exactly repository', checks);
  const local = data.local_directories ?? [];
  for (const name of ['planning', 'references', 'source-assets', 'private']) {
    check(local.includes(name) && existsSync(join(appRoot, name)), `WORKSPACE-DIR-${name}`, `${name}/ is declared and exists`, checks);
  }
  return data;
}

function validateAppSpec(repo, checks) {
  const file = join(repo, 'appspec.yaml');
  check(existsSync(file), 'APPSPEC-001', 'appspec.yaml exists', checks);
  if (!existsSync(file)) return null;
  let spec;
  try { spec = parseConfig(file); } catch (error) {
    checks.push({ id: 'APPSPEC-002', outcome: 'fail', message: error.message });
    return null;
  }
  check(spec.schema_version === 1, 'APPSPEC-002', 'AppSpec schema version is 1', checks);
  check(spec.application?.locale === 'en', 'APPSPEC-003', 'AppSpec interface locale is English', checks);
  check(Array.isArray(spec.requirements) && spec.requirements.length > 0, 'APPSPEC-004', 'AppSpec has requirements', checks);
  const seen = new Set();
  for (const requirement of spec.requirements ?? []) {
    const validId = /^[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/.test(requirement.id ?? '');
    check(validId && !seen.has(requirement.id), 'APPSPEC-ID', `unique requirement id ${requirement.id ?? '<missing>'}`, checks);
    seen.add(requirement.id);
    check(Array.isArray(requirement.acceptance) && requirement.acceptance.length > 0, 'APPSPEC-ACCEPTANCE', `${requirement.id ?? '<missing>'} has acceptance criteria`, checks);
    const serialized = JSON.stringify(requirement);
    check(!/\b(?:TODO|TBD|FIXME|PLACEHOLDER)\b/i.test(serialized), 'APPSPEC-PLACEHOLDER', `${requirement.id ?? '<missing>'} contains no placeholder`, checks);
  }
  return spec;
}

function validateTraceability(repo, spec, checks, requireVerified = false) {
  const file = join(repo, '.ishiku', 'requirements', 'traceability.yaml');
  check(existsSync(file), 'TRACE-001', 'traceability matrix exists', checks);
  if (!existsSync(file) || !spec) return false;
  let trace;
  try { trace = parseConfig(file); } catch (error) {
    checks.push({ id: 'TRACE-002', outcome: 'fail', message: error.message });
    return false;
  }
  const rows = new Map((trace.requirements ?? []).map((row) => [row.id, row]));
  let allVerified = true;
  for (const requirement of spec.requirements ?? []) {
    const row = rows.get(requirement.id);
    check(Boolean(row), 'TRACE-COVERAGE', `${requirement.id} appears in traceability`, checks);
    if (!row) {
      allVerified = false;
      continue;
    }
    check(Array.isArray(row.implementation) && row.implementation.length > 0, 'TRACE-IMPLEMENTATION', `${requirement.id} maps to implementation`, checks);
    const testCount = Object.values(row.tests ?? {}).flat().length;
    const mandatory = ['critical', 'high'].includes(requirement.priority);
    check(!mandatory || testCount > 0, 'TRACE-TEST', `${requirement.id} mandatory test coverage`, checks);
    check(!requirement.security_critical || (row.tests?.security?.length ?? 0) > 0, 'TRACE-SECURITY', `${requirement.id} security coverage`, checks);
    if (row.status !== 'verified') allVerified = false;
    if (requireVerified) check(row.status === 'verified', 'TRACE-VERIFIED', `${requirement.id} has executed verification evidence`, checks);
  }
  return allVerified;
}

function trackedFiles(repo) {
  try {
    const raw = execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' });
    return raw.split('\0').filter(Boolean).map((entry) => join(repo, entry)).filter(existsSync);
  } catch {
    return walk(repo);
  }
}

function boundaryAndSecretChecks(repo, checks) {
  const files = trackedFiles(repo);
  const textExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.json', '.yaml', '.yml', '.md', '.html', '.css', '.env', '.txt', '.csv', '.sh', '.ps1']);
  const sensitiveName = /(^|[\\/])(?:private|planning)([\\/]|$)|(^|[\\/])\.env$|\.(?:sqlite|sqlite3|db|bak|pfx|p12|pem|key)$/i;
  for (const file of files) {
    const rel = relative(repo, file).replaceAll('\\', '/');
    check(!sensitiveName.test(rel) || rel === '.env.example', 'BOUNDARY-PRIVATE', `${rel} is safe to publish`, checks);
    const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
    if (!textExtensions.has(extension) || statSync(file).size > 1_000_000) continue;
    const body = readFileSync(file, 'utf8');
    const credentialPattern = /(?:AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}|(?:password|secret|token)\s*[:=]\s*["'](?=[A-Za-z0-9+/=_-]{20,}["'])(?=[^"']*[A-Za-z])(?=[^"']*[0-9])[A-Za-z0-9+/=_-]+["'])/i;
    const credentialMatch = body.match(credentialPattern)?.[0] ?? '';
    const clearlySynthetic = /(?:unit-test|e2e|synthetic|fixture|example|demo|replace|change-me)/i.test(credentialMatch);
    check(!credentialMatch || clearlySynthetic, 'SECURITY-SECRET', `${rel} contains no credential pattern`, checks);
    check(!/[A-Za-z]:\\Users\\[^\\\s]+\\/i.test(body), 'BOUNDARY-ABSOLUTE', `${rel} contains no local absolute Windows path`, checks);
  }
}

function workflowChecks(repo, checks) {
  const root = join(repo, '.github', 'workflows');
  check(existsSync(root), 'WORKFLOW-001', 'GitHub workflow directory exists', checks);
  for (const entry of existsSync(root) ? readdirSync(root, { withFileTypes: true }) : []) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const file = join(root, entry.name);
    const body = readFileSync(file, 'utf8');
    const refs = [...body.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/g)];
    for (const [, action, ref] of refs) {
      if (action.startsWith('./') || action.startsWith('docker://')) continue;
      check(/^[a-f0-9]{40}$/.test(ref), 'WORKFLOW-PIN', `${relative(repo, file)} pins ${action} to a full SHA`, checks);
    }
    check(!/(?:\.\.\/)+(?:\.ishiku|planning|private)/.test(body), 'WORKFLOW-BOUNDARY', `${relative(repo, file)} is clone-independent`, checks);
    check(/permissions:/.test(body), 'WORKFLOW-PERMISSIONS', `${relative(repo, file)} declares permissions`, checks);
  }
}

function designChecks(repo, checks) {
  const candidates = walk(repo, (file) => /\.(?:html|jsx|tsx|vue|svelte)$/i.test(file));
  const germanUi = /(?:>\s*|["'`])(?:Anmelden|Abmelden|Einstellungen|Über|Fehler|Speichern|Abbrechen|Löschen|Zurück|Weiter|Benutzername|Passwort)(?:\s*<|["'`])/i;
  for (const file of candidates) {
    const body = readFileSync(file, 'utf8');
    check(!germanUi.test(body), 'DESIGN-LOCALE', `${relative(repo, file)} has no detected German UI label`, checks);
  }
}

function manifestChecks(repo, checks) {
  const file = join(repo, '.ishiku', 'kit-manifest.json');
  check(existsSync(file), 'KIT-001', 'kit manifest exists', checks);
  check(existsSync(join(repo, '.ishiku', 'kit-version.lock')), 'KIT-002', 'kit version lock exists', checks);
  if (!existsSync(file)) return;
  const manifest = parseConfig(file);
  for (const item of manifest.managed ?? []) {
    const target = join(repo, item.path);
    check(existsSync(target) && sha256(target) === item.sha256, 'KIT-CHECKSUM', `${item.path} matches the managed checksum`, checks);
  }
}

function runProjectCommands(repo, project, checks) {
  const commands = project.verification?.commands ?? [];
  check(commands.length > 0, 'VERIFY-COMMANDS', 'project declares verification commands', checks);
  for (const item of commands) {
    const started = new Date().toISOString();
    const result = spawnSync(item.command, { cwd: repo, encoding: 'utf8', shell: true, timeout: item.timeout_ms ?? 1_800_000 });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-12_000);
    checks.push({ id: `COMMAND-${item.name}`, outcome: result.status === 0 ? 'pass' : 'fail', message: item.command, started, exit_code: result.status, output });
  }
}

function verifyRepository(appRoot, options = {}) {
  const checks = [];
  const directRepository = existsSync(join(appRoot, '.ishiku', 'project.yaml')) && existsSync(join(appRoot, 'appspec.yaml'));
  let workspace;
  let repo;
  if (directRepository) {
    repo = resolve(appRoot);
    let projectIdentity = {};
    try { projectIdentity = parseConfig(join(repo, '.ishiku', 'project.yaml')).application ?? {}; } catch {}
    workspace = { application: projectIdentity, repository: { path: '.' } };
    check(true, 'BOUNDARY-001', 'standalone clone repository root detected', checks);
  } else {
    workspace = readWorkspace(appRoot, checks);
    repo = resolve(appRoot, workspace?.repository?.path ?? 'repository');
    check(inside(appRoot, repo) && repo !== resolve(appRoot), 'BOUNDARY-001', 'repository is a child of the app workspace', checks);
  }
  check(existsSync(repo), 'REPOSITORY-001', 'repository directory exists', checks);
  check(existsSync(join(repo, '.git')), 'REPOSITORY-002', 'Git metadata exists under repository/', checks);
  check(existsSync(join(repo, 'AGENTS.md')), 'REPOSITORY-003', 'app-local AGENTS.md exists', checks);
  const projectFile = join(repo, '.ishiku', 'project.yaml');
  check(existsSync(projectFile), 'PROJECT-001', 'project.yaml exists', checks);
  let project = null;
  if (existsSync(projectFile)) {
    try { project = parseConfig(projectFile); } catch (error) { checks.push({ id: 'PROJECT-002', outcome: 'fail', message: error.message }); }
  }
  if (project) {
    check(project.schema_version === 1, 'PROJECT-002', 'project schema version is 1', checks);
    check(project.application?.id === workspace?.application?.id, 'PROJECT-003', 'workspace and project application ids match', checks);
    check(project.platform?.locale === 'en', 'PROJECT-LOCALE', 'project locale is English', checks);
    const expectedAuth = project.application.id === 'dropiku' ? 'dropiku-totp-vault' : project.application.id === 'meiku' ? 'meiku-client-vault' : 'standard-account';
    check(project.platform?.authentication === expectedAuth, 'PROJECT-AUTH', 'authentication profile matches approved exceptions', checks);
  }
  const spec = validateAppSpec(repo, checks);
  const traceabilityComplete = validateTraceability(repo, spec, checks, options.full && !options.allowUnverifiedRequirements);
  boundaryAndSecretChecks(repo, checks);
  workflowChecks(repo, checks);
  designChecks(repo, checks);
  manifestChecks(repo, checks);
  if (options.full && project) runProjectCommands(repo, project, checks);
  const failed = checks.filter((item) => item.outcome === 'fail');
  const status = failed.length === 0 && options.full && traceabilityComplete ? 'VERIFIED' : 'IMPLEMENTED_BUT_NOT_VERIFIED';
  const report = { schema_version: 1, application: workspace?.application?.id ?? basename(appRoot), timestamp: new Date().toISOString(), mode: options.full ? 'full' : 'structural', status, traceability: { all_requirements_verified: traceabilityComplete }, summary: { passed: checks.length - failed.length, failed: failed.length }, checks };
  if (existsSync(repo)) writeJson(join(repo, '.ishiku', 'reports', `verification-${options.full ? 'full' : 'structural'}.json`), report);
  return report;
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.summary.failed > 0) process.exitCode = 1;
}

function verifyWorkspace(root, options = {}) {
  const workspaceRoot = resolve(root);
  const apps = readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(workspaceRoot, entry.name, 'workspace.yaml')))
    .map((entry) => join(workspaceRoot, entry.name));
  const reports = apps.map((app) => verifyRepository(app, options));
  const failed = reports.reduce((count, report) => count + report.summary.failed, 0);
  const report = { schema_version: 1, timestamp: new Date().toISOString(), mode: options.full ? 'full' : 'structural', status: failed === 0 && options.full && reports.every((item) => item.status === 'VERIFIED') ? 'VERIFIED' : 'IMPLEMENTED_BUT_NOT_VERIFIED', applications: reports.map((item) => ({ application: item.application, status: item.status, ...item.summary })), summary: { passed: reports.filter((item) => item.summary.failed === 0).length, failed } };
  writeJson(join(workspaceRoot, '.ishiku', 'reports', `workspace-verification-${options.full ? 'full' : 'structural'}.json`), report);
  printReport(report);
}

function copyTree(source, destination, entries, repo, include = () => true) {
  for (const file of walk(source)) {
    if (!include(file)) continue;
    const rel = relative(source, file);
    const target = join(destination, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
    entries.push({ path: relative(repo, target).replaceAll('\\', '/'), sha256: sha256(target) });
  }
}

function findConflicts(repo, manifest) {
  const allowed = new Set(manifest.allowed_overrides ?? []);
  return (manifest.managed ?? []).filter((item) => {
    const target = join(repo, item.path);
    return existsSync(target) && !matchesSha(target, item.sha256) && !allowed.has(item.path);
  }).map((item) => item.path);
}

function syncOne(appRoot) {
  const source = kitSource();
  if (!source.workspace) fail('sync-kit must run from the central workspace kit.');
  const checks = [];
  const workspace = readWorkspace(resolve(appRoot), checks);
  if (!workspace || checks.some((item) => item.outcome === 'fail')) fail(`Invalid workspace: ${appRoot}`);
  const repo = resolve(appRoot, workspace.repository.path);
  const manifestFile = join(repo, '.ishiku', 'kit-manifest.json');
  const previousManifest = existsSync(manifestFile) ? parseConfig(manifestFile) : null;
  if (previousManifest) {
    const conflicts = findConflicts(repo, previousManifest);
    if (conflicts.length) {
      writeJson(join(repo, '.ishiku', 'reports', 'sync-conflict.json'), { timestamp: new Date().toISOString(), status: 'BLOCKED', conflicts });
      fail(`Managed file conflicts detected:\n${conflicts.join('\n')}`);
    }
  }
  const managed = [];
  const localKit = join(repo, '.ishiku', 'kit');
  copyTree(
    join(source.kit, 'policies'),
    join(localKit, 'policies'),
    managed,
    repo,
    (file) => file !== join(source.kit, 'policies', 'design-system.md'),
  );
  copyTree(join(source.kit, 'schemas'), join(localKit, 'schemas'), managed, repo);
  const appScriptNames = new Set(['ishiku.mjs', 'verify-app', 'check-appspec', 'check-requirements', 'check-architecture', 'check-security', 'check-design', 'check-dependencies', 'check-release', 'compliance-test', 'generate-traceability', 'soak-test']);
  for (const name of appScriptNames) {
    const sourceFile = join(source.kit, 'scripts', name);
    const target = join(localKit, 'scripts', name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(sourceFile, target);
    managed.push({ path: relative(repo, target).replaceAll('\\', '/'), sha256: sha256(target) });
  }
  copyFileSync(join(source.kit, 'version.yaml'), join(localKit, 'version.yaml'));
  managed.push({ path: '.ishiku/kit/version.yaml', sha256: sha256(join(localKit, 'version.yaml')) });
  copyFileSync(join(source.kit, 'platform.yaml'), join(localKit, 'platform.yaml'));
  managed.push({ path: '.ishiku/kit/platform.yaml', sha256: sha256(join(localKit, 'platform.yaml')) });
  copyTree(join(source.workspace, '.agents', 'skills'), join(repo, '.agents', 'skills'), managed, repo);
  for (const workflow of walk(join(source.kit, 'workflows'), (file) => /\.ya?ml$/i.test(file))) {
    const rel = relative(join(source.kit, 'workflows'), workflow).replaceAll('\\', '/');
    const targetName = `ishiku-${rel.replaceAll('/', '-').replace(/\.yaml$/i, '.yml')}`;
    const target = join(repo, '.github', 'workflows', targetName);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(workflow, target);
    managed.push({ path: relative(repo, target).replaceAll('\\', '/'), sha256: sha256(target) });
  }
  for (const name of ['requirements', 'decisions', 'overrides', 'reports']) mkdirSync(join(repo, '.ishiku', name), { recursive: true });
  if (previousManifest) {
    const desired = new Set(managed.map((item) => item.path));
    for (const item of previousManifest.managed ?? []) {
      if (desired.has(item.path)) continue;
      const target = join(repo, item.path);
      if (existsSync(target) && matchesSha(target, item.sha256)) unlinkSync(target);
    }
  }
  const version = parseConfig(join(source.kit, 'version.yaml'));
  const manifest = { schema_version: 1, kit_version: version.kit_version, managed: managed.sort((a, b) => a.path.localeCompare(b.path)), application_owned: ['AGENTS.md', 'appspec.yaml', '.ishiku/project.yaml', '.ishiku/requirements/', '.ishiku/decisions/'], generated: ['.ishiku/reports/'], allowed_overrides: ['.ishiku/overrides/'], local_changes: [] };
  writeJson(manifestFile, manifest);
  writeJson(join(repo, '.ishiku', 'kit-version.lock'), { schema_version: 1, kit_version: version.kit_version, installed_at: new Date().toISOString(), source: 'workspace:.ishiku', source_version: version.released, checksums: Object.fromEntries(manifest.managed.map((item) => [item.path, item.sha256])) });
  const report = { timestamp: new Date().toISOString(), application: workspace.application.id, kit_version: version.kit_version, status: 'synchronized', managed_files: managed.length, conflicts: [] };
  writeJson(join(repo, '.ishiku', 'reports', 'sync-kit.json'), report);
  return report;
}

function syncKit(target, all) {
  const root = resolve(target);
  const appRoots = all
    ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'workspace.yaml'))).map((entry) => join(root, entry.name))
    : [root];
  const reports = appRoots.map(syncOne);
  process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
}

function generateTraceability(repo) {
  const spec = parseConfig(join(repo, 'appspec.yaml'));
  const testHint = existsSync(join(repo, 'tests')) ? 'tests/' : 'project verification command';
  const trace = { schema_version: 1, generated_from: 'appspec.yaml', requirements: spec.requirements.map((requirement) => ({ id: requirement.id, implementation: ['See application source and migration inventory.'], tests: { unit: [], integration: [testHint], e2e: [], security: requirement.security_critical ? [testHint] : [] }, status: 'implemented' })) };
  writeJson(join(repo, '.ishiku', 'requirements', 'traceability.yaml'), trace);
  process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
}

function buildDistributionManifest() {
  const source = kitSource();
  if (!source.workspace) fail('build-distribution-manifest must run from the central workspace kit.');
  const version = parseConfig(join(source.kit, 'version.yaml'));
  const files = [];
  for (const directory of ['policies', 'schemas', 'scripts', 'templates', 'workflows', 'fixtures']) {
    for (const file of walk(join(source.kit, directory))) files.push({ path: relative(source.workspace, file).replaceAll('\\', '/'), sha256: sha256(file) });
  }
  for (const file of walk(join(source.workspace, '.agents', 'skills'))) files.push({ path: relative(source.workspace, file).replaceAll('\\', '/'), sha256: sha256(file) });
  const manifest = { schema_version: 1, kit_version: version.kit_version, generated_at: new Date().toISOString(), files: files.sort((a, b) => a.path.localeCompare(b.path)) };
  writeJson(join(source.kit, 'distribution', 'manifest.json'), manifest);
  process.stdout.write(`${JSON.stringify({ kit_version: version.kit_version, files: files.length }, null, 2)}\n`);
}

function createApp(id, displayName) {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(id ?? '')) fail('App id must match ^[a-z][a-z0-9-]{1,31}$.');
  if (!displayName) fail('A display name is required.');
  const source = kitSource();
  if (!source.workspace) fail('create-app must run from the central workspace kit.');
  const appRoot = join(source.workspace, id);
  if (existsSync(appRoot)) fail(`Target already exists: ${appRoot}`);
  mkdirSync(appRoot, { recursive: true });
  for (const name of ['planning', 'references', 'source-assets', 'private', 'repository']) mkdirSync(join(appRoot, name), { recursive: true });
  writeJson(join(appRoot, 'workspace.yaml'), { schema_version: 1, application: { id, name: displayName, family: 'ishiku' }, repository: { path: 'repository' }, local_directories: ['planning', 'references', 'source-assets', 'private'] });
  copyTree(join(source.kit, 'templates', 'repository'), join(appRoot, 'repository'), [], join(appRoot, 'repository'));
  for (const file of walk(join(appRoot, 'repository'))) {
    const body = readFileSync(file, 'utf8').replaceAll('__APP_ID__', id).replaceAll('__APP_NAME__', displayName);
    writeFileSync(file, body, 'utf8');
  }
  execFileSync('git', ['init', '-b', 'main'], { cwd: join(appRoot, 'repository'), stdio: 'inherit' });
  syncOne(appRoot);
  generateTraceability(join(appRoot, 'repository'));
  printReport(verifyRepository(appRoot, { full: false }));
}

if (!command) fail('Usage: ishiku.mjs <command> [path] [options]');
const full = args.includes('--full');
const allowUnverifiedRequirements = args.includes('--allow-unverified-requirements');
const positionals = args.filter((arg) => !arg.startsWith('--'));
switch (command) {
  case 'verify-workspace': verifyWorkspace(positionals[0] ?? '.', { full, allowUnverifiedRequirements }); break;
  case 'verify-app': printReport(verifyRepository(resolve(positionals[0] ?? '.'), { full, allowUnverifiedRequirements })); break;
  case 'check-appspec':
  case 'check-requirements':
  case 'check-architecture':
  case 'check-security':
  case 'check-design':
  case 'check-dependencies':
  case 'check-release': printReport(verifyRepository(resolve(positionals[0] ?? '.'), { full: false })); break;
  case 'sync-kit': syncKit(positionals[0] ?? '.', args.includes('--all')); break;
  case 'generate-traceability': generateTraceability(resolve(positionals[0] ?? '.')); break;
  case 'build-distribution-manifest': buildDistributionManifest(); break;
  case 'create-app': createApp(positionals[0], positionals[1]); break;
  default: fail(`Unknown command: ${command}`);
}
