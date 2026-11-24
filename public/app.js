import { initPixelSoftUtilityApp } from "./design-system/app-shell.js";
import { setPixelSoftUtilityMode, setPixelSoftUtilityTheme } from "./design-system/theme-controller.js";
import { bindRegisterWindow } from "./design-system/setup-flow.js";

const state = {
  manifest: null,
  session: null,
  status: null,
  jobs: [],
  selectedJob: null,
  commandJob: null,
  libraryOffset: 0,
  libraryLimit: 80,
  libraryTotal: 0,
  libraryItems: [],
  libraryLoading: false,
  activeAmazonLoginId: null,
  amazonLoginLinkOpened: false,
  amazonLoginReadyAnnounced: false,
  currentView: "dashboard"
};

const themeLabels = {
  lavender: "Lavender",
  mint: "Mint",
  sky: "Sky",
  amber: "Amber",
  rose: "Rose",
  graphite: "Graphite"
};
const modeLabels = { system: "System", light: "Light", dark: "Dark" };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function initialsFromName(value, fallback = "A") {
  const parts = String(value || "").trim().split(/[\s._-]+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : (parts[0] || fallback).slice(0, 2);
  return initials.toUpperCase() || fallback;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status === 401) {
    await refreshSession();
    renderAuthGate();
  }
  if (!response.ok) {
    const error = new Error(body?.error || response.statusText);
    error.details = body?.details;
    throw error;
  }
  return body;
}

function toast(message) {
  const element = $("#psu-toast-host");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("visible"), 3200);
}

async function injectIconSprite() {
  const target = $("#iconSprite");
  if (!target) return;
  target.innerHTML = await fetch("/icons/psu-icons.svg").then((response) => response.text()).catch(() => "");
}

async function loadManifest() {
  state.manifest = await fetch("/app.manifest.json").then((response) => response.json());
  let configScript = document.querySelector("script[type='application/json'][data-psu-app-config]");
  if (!configScript) {
    configScript = document.createElement("script");
    configScript.type = "application/json";
    configScript.dataset.psuAppConfig = "";
    document.head.append(configScript);
  }
  configScript.textContent = JSON.stringify(state.manifest);
  initPixelSoftUtilityApp(state.manifest);
}

async function refreshSession() {
  state.session = await api("/api/session");
  return state.session;
}

function renderAuthGate() {
  const authRoot = $("#authRoot");
  const appRoot = $("#appRoot");
  const session = state.session;
  if (!session) return;

  if (session.authenticated) {
    authRoot.innerHTML = "";
    authRoot.hidden = true;
    appRoot.hidden = false;
    $("#openCommandWindow").hidden = session.user?.role !== "admin";
    const displayName = session.user?.displayName || session.user?.username || "Admin";
    $("#signedInUser").textContent = displayName;
    $("#settingsAccountName").textContent = displayName;
    $("#profileButton").textContent = initialsFromName(displayName);
    $("#settingsAvatar").textContent = initialsFromName(displayName);
    hydrateAccountForm();
    return;
  }

  $("#commandWindow").close();
  $("#commandForm").reset();
  $("#commandError").textContent = "";
  state.commandJob = null;
  renderCommandJob(null);
  appRoot.hidden = true;
  authRoot.hidden = false;

  if (session.setup.required && !session.setup.configured) {
    authRoot.innerHTML = setupErrorTemplate(session.setup.error);
    return;
  }

  if (session.setup.required) {
    authRoot.innerHTML = registerTemplate();
    const setupSecret = $("#setup_secret");
    setupSecret?.focus();
    bindRegisterWindow($("#setupForm"), {
      appId: state.manifest.app_id,
      appName: state.manifest.app_name,
      onSubmit: async (data, form) => {
        setFormBusy(form, true);
        try {
          const payload = {
            setupSecret: data.get("setup_secret"),
            displayName: data.get("admin_display_name"),
            username: data.get("admin_username"),
            email: data.get("admin_email"),
            password: data.get("admin_password"),
            passwordConfirm: data.get("admin_password_confirm")
          };
          state.session = await api("/api/setup", { method: "POST", body: JSON.stringify(payload) });
          toast("Admin account created");
          renderAuthGate();
          await loadAppData();
        } catch (error) {
          renderFormErrors(form, error.details);
          toast(error.message);
        } finally {
          setFormBusy(form, false);
        }
      }
    });
    return;
  }

  authRoot.innerHTML = loginTemplate();
  $("#auth_username")?.focus();
  $("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFormBusy(form, true);
    try {
      state.session = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") })
      });
      toast("Logged in");
      renderAuthGate();
      await loadAppData();
    } catch (error) {
      $("#authError").textContent = error.message;
      $("#authError").hidden = false;
    } finally {
      setFormBusy(form, false);
    }
  });
}

function hydrateAccountForm() {
  const user = state.session?.user;
  if (!user) return;
  $("#accountDisplayName").value = user.displayName || user.username || "";
  $("#accountUsername").value = user.username || "";
  $("#accountEmail").value = user.email || "";
  $("#accountError").textContent = "";
}

function showAccountEditor(open) {
  $("#accountEditView").hidden = !open;
  $("#accountPanelButton").hidden = open;
  $("#settingsSheet .sheet-block").hidden = open;
  $("#settingsSheet .psu-list").hidden = open;
  if (open) {
    hydrateAccountForm();
    requestAnimationFrame(() => $("#accountDisplayName")?.focus());
  }
}

function setupBrand() {
  return `
    <div class="psu-setup-brand">
      <div class="psu-setup-logo">
        <img src="${escapeAttr(state.manifest.app_logo.src)}" alt="Libiku Logo" />
      </div>
      <div>
        <h1 class="psu-setup-title">${escapeHtml(state.manifest.app_name)}</h1>
        <p class="psu-setup-subtitle">${escapeHtml(state.manifest.app_subtitle)}</p>
      </div>
    </div>
  `;
}

function setupErrorTemplate(message) {
  return `
    <main class="psu-setup-screen">
      <section class="psu-setup-error-window">
        ${setupBrand()}
        <article class="psu-tonal-card">
          <h2 class="psu-card-title">Setup is waiting for a secret</h2>
          <p class="psu-card-text">Create a Docker secret or set the local fallback before the first admin account is created.</p>
        </article>
        <article class="psu-technical-card setup-technical-card">
          <span class="psu-label">Missing configuration</span>
          <div class="psu-technical-value">${escapeHtml(message || "ISHIKU_SETUP_SECRET_FILE or ISHIKU_SETUP_SECRET")}</div>
        </article>
      </section>
    </main>
  `;
}

function registerTemplate() {
  return `
    <main class="psu-setup-screen">
      <section class="psu-register-window" role="dialog" aria-modal="true" aria-labelledby="setupTitle">
        ${setupBrand()}
        <form id="setupForm" class="psu-form-stack" data-app-id="libiku" data-app-name="Libiku">
          <h2 id="setupTitle" class="center-title">Set up admin</h2>
          ${fieldTemplate("setup_secret", "Setup secret", "password", "one-time-code")}
          ${fieldTemplate("admin_display_name", "Display name", "text", "name")}
          ${fieldTemplate("admin_username", "Admin username", "text", "username")}
          ${fieldTemplate("admin_email", "Email (optional)", "email", "email", false)}
          ${fieldTemplate("admin_password", "Admin password", "password", "new-password")}
          ${fieldTemplate("admin_password_confirm", "Repeat password", "password", "new-password")}
          <div class="psu-password-requirements">
            <strong>Password rules</strong>
            <ul>
              <li>At least 12 characters.</li>
              <li>Must not match the setup secret, username, app ID, or app name.</li>
              <li>Do not use placeholders like admin, password, or changeme.</li>
            </ul>
          </div>
          <div class="psu-setup-actions">
            <button class="psu-button psu-button--filled" type="submit">Create admin account</button>
          </div>
          <p class="psu-setup-footnote">Registration closes automatically after this account is created.</p>
        </form>
      </section>
    </main>
  `;
}

function loginTemplate() {
  return `
    <main class="psu-setup-screen">
      <section class="psu-auth-window" role="dialog" aria-modal="true" aria-label="Libiku sign in">
        ${setupBrand()}
        <form id="authForm" class="psu-form-stack">
          ${fieldTemplate("username", "Username", "text", "username", true, "auth_username")}
          ${fieldTemplate("password", "Password", "password", "current-password", true, "auth_password")}
          <p id="authError" class="psu-field-error" hidden></p>
          <div class="psu-setup-actions">
            <button class="psu-button psu-button--filled psu-button--full" type="submit">Sign in</button>
          </div>
        </form>
      </section>
    </main>
  `;
}

function fieldTemplate(name, label, type, autocomplete, required = true, id = name) {
  return `
    <label class="psu-field">
      <span class="psu-label">${label}</span>
      <input id="${id}" class="psu-input" name="${name}" type="${type}" autocomplete="${autocomplete}" ${required ? "required" : ""} aria-invalid="false" />
      <span class="psu-field-error" data-field-error="${name}" hidden></span>
    </label>
  `;
}

function setFormBusy(form, busy) {
  form.querySelectorAll("button, input, textarea, select").forEach((control) => {
    control.disabled = busy;
  });
}

function renderFormErrors(form, errors = {}) {
  if (!errors) return;
  const map = {
    displayName: "admin_display_name",
    username: "admin_username",
    email: "admin_email",
    password: "admin_password",
    passwordConfirm: "admin_password_confirm"
  };
  Object.entries(errors).forEach(([key, value]) => {
    const name = map[key] || key;
    const input = form.querySelector(`[name="${cssEscape(name)}"]`);
    const error = form.querySelector(`[data-field-error="${cssEscape(name)}"]`);
    if (input) input.setAttribute("aria-invalid", "true");
    if (error) {
      error.textContent = value;
      error.hidden = false;
    }
  });
}

function renderStatus() {
  const status = state.status;
  if (!status) return;
  const activeJobs = status.runningJobs?.length || 0;
  const queuedJobs = status.queuedJobs?.length || 0;
  $("#heroStatus").textContent = `${status.libationVersion || "Libation CLI"} is ready. ${activeJobs} running, ${queuedJobs} queued.`;
  $("#publicIp").textContent = status.publicIp?.ip || (status.publicIp?.error ? "Error" : "unknown");
  $("#jobCount").textContent = String(activeJobs + queuedJobs);
  renderDiagnostics();
}

function renderDiagnostics() {
  const status = state.status;
  if (!status) return;
  const rows = [
    ["App", `${status.appName || "Libiku"} ${status.appVersion || "dev"}`],
    ["Libation", status.libationVersion || "Libation CLI"],
    ["Build", status.appBuildDate || "unknown"],
    ["Commit", status.appCommit || "unknown"],
    ["Config", status.paths?.libationFilesDir || "-"],
    ["Database", status.paths?.dbPath || status.paths?.dbDir || "-"],
    ["Books", status.paths?.booksDir || "-"],
    ["Health", "ok"]
  ];
  $("#diagnosticsList").innerHTML = rows.map(([label, value]) => `
    <div class="technical-row">
      <span>${escapeHtml(label)}</span>
      <code>${escapeHtml(value)}</code>
    </div>
  `).join("");
}

function renderJobs() {
  const active = state.jobs.filter((job) => ["running", "queued"].includes(job.status));
  const recent = state.jobs.slice(0, 8);
  $("#activeJobs").innerHTML = active.length ? active.map(jobItem).join("") : "No active jobs";
  $("#activeJobs").classList.toggle("empty-state", active.length === 0);
  $("#recentJobs").innerHTML = recent.length ? recent.map(jobItem).join("") : "No jobs yet";
  $("#recentJobs").classList.toggle("empty-state", recent.length === 0);
  const selectedId = $("#jobSelector").value || state.selectedJob?.id || "";
  $("#jobSelector").innerHTML = state.jobs.length
    ? state.jobs.map((job) => `<option value="${job.id}">${escapeHtml(job.label)} - ${job.status}</option>`).join("")
    : `<option value="">No jobs</option>`;
  if (selectedId && state.jobs.some((job) => job.id === selectedId)) $("#jobSelector").value = selectedId;
  renderDownloadQueue();
  if (state.libraryItems.length) {
    $("#libraryRows").innerHTML = state.libraryItems.map(libraryCard).join("");
  }
  renderAmazonLogin();
}

function jobItem(job) {
  const klass = job.status === "succeeded" ? "ok" : job.status === "failed" ? "error" : "warn";
  const status = job.status === "queued" && job.queuePosition ? `queued #${job.queuePosition}` : job.status;
  const start = job.startedAt ? formatDate(job.startedAt) : `Queued ${formatDate(job.queuedAt)}`;
  return `
    <article class="list-card">
      <div class="item-row">
        <strong>${escapeHtml(job.label)}</strong>
        <span class="status-chip ${klass}">${escapeHtml(status)}</span>
      </div>
      <small>${start}${job.finishedAt ? ` to ${formatDate(job.finishedAt)}` : ""}</small>
    </article>
  `;
}

async function loadStatus() {
  state.status = await api("/api/status");
  renderStatus();
}

async function loadJobs() {
  const previousActive = state.jobs.find((job) => job.id === state.activeAmazonLoginId);
  state.jobs = await api("/api/jobs");
  renderJobs();
  const currentActive = state.jobs.find((job) => job.id === state.activeAmazonLoginId);
  if (currentActive?.phase === "completed" && previousActive?.phase !== "completed") {
    await loadAccounts();
    toast("Amazon account connected");
  }
}

async function startAction(action, extra = {}) {
  const job = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ action, ...extra })
  });
  toast(job.status === "queued" ? `Added to queue: ${job.label}` : `Job started: ${job.label}`);
  await Promise.all([loadStatus(), loadJobs()]);
  await focusJob(job.id, false);
}

function resetLibrary() {
  state.libraryOffset = 0;
  state.libraryTotal = 0;
  state.libraryItems = [];
  $("#libraryRows").innerHTML = `<article class="psu-card empty-state">Loading library...</article>`;
  $("#libraryMeta").textContent = "Loading library...";
  $("#loadMoreLibraryButton").disabled = true;
}

async function loadLibrary({ append = false } = {}) {
  if (state.libraryLoading) return;
  state.libraryLoading = true;
  $("#loadMoreLibraryButton").disabled = true;
  if (!append) resetLibrary();

  const params = new URLSearchParams({
    search: $("#librarySearch").value,
    status: $("#libraryStatus").value,
    sort: $("#librarySort").value,
    limit: state.libraryLimit,
    offset: state.libraryOffset
  });

  try {
    const result = await api(`/api/library?${params}`);
    state.libraryTotal = result.total || 0;
    state.libraryItems = append ? [...state.libraryItems, ...result.items] : result.items;
    state.libraryOffset = state.libraryItems.length;
    renderLibrary(result);
  } finally {
    state.libraryLoading = false;
    updateLibraryLoadButton();
  }
}

function renderLibrary(result = {}) {
  const shown = state.libraryItems.length;
  $("#libraryCount").textContent = String(state.libraryTotal || 0);
  $("#libraryMeta").textContent = result.warning || `${shown} of ${state.libraryTotal} titles`;
  $("#libraryRows").innerHTML = state.libraryItems.length
    ? state.libraryItems.map(libraryCard).join("")
    : emptyState("No titles found", "Refresh reads the current Libation database.");
  renderDownloadQueue();
}

function renderDownloadQueue() {
  const element = $("#downloadQueue");
  if (!element) return;
  const downloads = state.jobs.filter(
    (job) => job.action === "liberate" && job.asin && ["running", "queued"].includes(job.status)
  );
  element.classList.toggle("empty-state", downloads.length === 0);
  element.innerHTML = downloads.length
    ? `<strong>Download queue</strong>${downloads.map((job) => {
      const status = job.status === "queued" ? `Position ${job.queuePosition}` : "Downloading now";
      return `<span><code>${escapeHtml(job.asin)}</code> · ${escapeHtml(status)}</span>`;
    }).join("")}`
    : "Download queue is empty.";
}

function updateLibraryLoadButton() {
  const button = $("#loadMoreLibraryButton");
  const hasMore = state.libraryItems.length < state.libraryTotal;
  button.disabled = state.libraryLoading || !hasMore;
  button.textContent = state.libraryLoading
    ? "Loading..."
    : hasMore
      ? `Load more (${state.libraryItems.length}/${state.libraryTotal})`
      : state.libraryTotal
        ? `All loaded (${state.libraryTotal})`
        : "Load more";
}

function libraryCard(item) {
  const [label, klass] = formatStatus(item.bookStatus);
  const downloadJob = state.jobs.find(
    (job) => job.asin === item.asin && job.action === "liberate" && ["running", "queued"].includes(job.status)
  );
  const liberateLabel = downloadJob?.status === "running"
    ? "Downloading..."
    : downloadJob?.status === "queued"
      ? `Queued #${downloadJob.queuePosition}`
      : "Liberate";
  const disabled = downloadJob ? " disabled aria-disabled=\"true\"" : "";
  const subtitle = item.subtitle ? `<p class="book-subtitle">${escapeHtml(item.subtitle)}</p>` : "";
  const meta = [item.contributors, item.series].filter(Boolean).map(escapeHtml).join("<br>");
  return `
    <article class="psu-card book-card">
      <div class="book-card-main">
        <div>
          <h3>${escapeHtml(item.title || "Untitled")}</h3>
          ${subtitle}
          <p class="book-meta">${meta || "Author / series unknown"}</p>
        </div>
        <span class="status-chip ${klass}">${label}</span>
      </div>
      <div class="book-details">
        <code>${escapeHtml(item.asin || "")}</code>
        <span>${item.lengthInMinutes || 0} min</span>
        <span>${escapeHtml(formatDate(item.dateAdded) || "-")}</span>
      </div>
      <div class="book-actions">
        <button class="psu-button psu-button--filled" type="button" data-liberate="${escapeAttr(item.asin || "")}"${disabled}>${liberateLabel}</button>
        <button class="psu-button psu-button--tonal" type="button" data-force="${escapeAttr(item.asin || "")}"${disabled}>Force</button>
        <button class="psu-button psu-button--outlined" type="button" data-pdf="${escapeAttr(item.asin || "")}"${disabled}>PDF</button>
        <button class="psu-button psu-button--text" type="button" data-status="${escapeAttr(item.asin || "")}">Status</button>
      </div>
    </article>
  `;
}

function emptyState(title, hint) {
  return `
    <article class="psu-tonal-card empty-panel">
      <div class="psu-logo-frame small-logo">
        <img src="${escapeAttr(state.manifest.app_logo.src)}" alt="Libiku Logo" />
      </div>
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(hint)}</p>
      </div>
    </article>
  `;
}

async function loadAccounts() {
  const result = await api("/api/accounts");
  $("#accountsList").innerHTML = result.accounts.length
    ? result.accounts.map((account) => `
      <article class="list-card">
        <div class="item-row">
          <strong>${escapeHtml(account.name || account.id)}</strong>
          <span class="status-chip ${account.authenticated ? "ok" : "error"}">${account.authenticated ? "auth" : "login needed"}</span>
        </div>
        <small>${escapeHtml(account.id || "")} - ${escapeHtml(account.locale || "")} - scan: ${account.scanLibrary ? "yes" : "no"}</small>
      </article>
    `).join("")
    : "No accounts configured";
  $("#accountsList").classList.toggle("empty-state", result.accounts.length === 0);
}

function upsertJob(job) {
  const index = state.jobs.findIndex((item) => item.id === job.id);
  if (index === -1) state.jobs.unshift(job);
  else state.jobs[index] = { ...state.jobs[index], ...job };
}

function showAmazonLoginJob(job) {
  state.activeAmazonLoginId = job.id;
  state.amazonLoginLinkOpened = false;
  state.amazonLoginReadyAnnounced = false;
  upsertJob(job);
  renderJobs();
  $("#amazonLoginProgressTitle").focus({ preventScroll: true });
}

function renderAmazonErrors(form, errors = {}) {
  form.querySelectorAll("[data-amazon-error]").forEach((element) => {
    element.textContent = "";
    element.hidden = true;
  });
  form.querySelectorAll("[aria-invalid]").forEach((element) => element.setAttribute("aria-invalid", "false"));
  Object.entries(errors || {}).forEach(([name, message]) => {
    const field = form.querySelector(`[name="${cssEscape(name)}"]`);
    const error = form.querySelector(`[data-amazon-error="${cssEscape(name)}"]`);
    field?.setAttribute("aria-invalid", "true");
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  });
}

function setAmazonLoginStep(current, completedAll = false) {
  const order = ["start", "signin", "return"];
  const currentIndex = order.indexOf(current);
  $$('[data-amazon-step]').forEach((element) => {
    const index = order.indexOf(element.dataset.amazonStep);
    element.classList.toggle("is-current", !completedAll && index === currentIndex);
    element.classList.toggle("is-complete", completedAll || (currentIndex > -1 && index < currentIndex));
  });
}

function renderAmazonLogin() {
  const startForm = $("#amazonLoginStartForm");
  const panel = $("#amazonLoginState");
  if (!startForm || !panel) return;

  if (!state.activeAmazonLoginId) {
    const resumable = state.jobs.find((job) => job.kind === "amazon-login" && job.phase && job.status === "running");
    if (resumable) state.activeAmazonLoginId = resumable.id;
  }
  const job = state.jobs.find((item) => item.id === state.activeAmazonLoginId);
  if (!job) {
    state.activeAmazonLoginId = null;
    startForm.hidden = false;
    panel.hidden = true;
    return;
  }

  const link = $("#amazonLoginLink");
  const completeForm = $("#amazonLoginCompleteForm");
  const cancelButton = $("#cancelAmazonLoginButton");
  const resetButton = $("#resetAmazonLoginButton");
  const status = $("#amazonLoginStatus");
  startForm.hidden = true;
  panel.hidden = false;
  link.hidden = true;
  completeForm.hidden = true;
  cancelButton.hidden = job.status !== "running" || ["cancelling", "verifying"].includes(job.phase);
  resetButton.hidden = job.status === "running";
  resetButton.textContent = job.phase === "completed" ? "Connect another account" : "Try again";

  if (job.phase === "starting") {
    setAmazonLoginStep("signin");
    status.textContent = "Preparing a secure Amazon sign-in link...";
    return;
  }

  if (job.phase === "awaiting-response" && job.loginUrl) {
    setAmazonLoginStep(state.amazonLoginLinkOpened ? "return" : "signin");
    link.href = job.loginUrl;
    link.hidden = false;
    completeForm.hidden = false;
    status.textContent = state.amazonLoginLinkOpened
      ? "Finish signing in, then paste the full URL from the final browser address bar below."
      : "Open Amazon sign-in. After Amazon redirects you, return here with the final browser URL.";
    if (!state.amazonLoginReadyAnnounced) {
      state.amazonLoginReadyAnnounced = true;
      toast("Amazon sign-in is ready");
    }
    return;
  }

  if (job.phase === "verifying") {
    setAmazonLoginStep("return");
    status.textContent = "Verifying the Amazon response and saving the account securely...";
    return;
  }

  if (job.phase === "cancelling") {
    setAmazonLoginStep("signin");
    status.textContent = "Cancelling Amazon sign-in...";
    return;
  }

  if (job.phase === "completed") {
    setAmazonLoginStep(null, true);
    status.textContent = "Amazon account connected. Reloading the Libation account list...";
    return;
  }

  setAmazonLoginStep("signin");
  status.textContent = job.phase === "expired"
    ? "This sign-in link expired. Start again to create a fresh link."
    : job.phase === "cancelled"
      ? "Amazon sign-in was cancelled."
      : "Amazon sign-in could not be completed. Start again with a fresh link.";
}

async function loadSettings() {
  const result = await api("/api/settings");
  $("#settingsEditor").value = JSON.stringify(result.settings, null, 2);
  $("#accountsSettingsEditor").value = JSON.stringify(result.accountsSettings, null, 2);
}

async function saveSettings(kind) {
  const editor = kind === "settings" ? $("#settingsEditor") : $("#accountsSettingsEditor");
  const value = JSON.parse(editor.value);
  await api(`/api/settings/${kind}`, {
    method: "PUT",
    body: JSON.stringify(value)
  });
  toast(`${kind} saved`);
}

async function loadSelectedJobLogs() {
  const id = $("#jobSelector").value;
  if (!id) return;
  const job = await api(`/api/jobs/${id}`);
  state.selectedJob = job;
  $("#jobLogs").textContent = formatJobLogs(job);
}

function formatJobLogs(job) {
  return job.logs?.map((entry) => `[${entry.at}] ${entry.stream}: ${entry.line}`).join("\n") || "No logs yet";
}

function renderCommandJob(job) {
  const status = $("#commandStatus");
  let message = "";
  if (job?.status === "queued") message = `${job.label} · queued #${job.queuePosition}`;
  else if (job?.status === "running") message = `${job.label} · running`;
  else if (job?.exitCode != null) message = `${job.label} · exit code ${job.exitCode}`;
  else if (job) message = `${job.label} · ${job.status}`;
  if (status.textContent !== message) status.textContent = message;
  const output = $("#commandLogs");
  const lines = job ? formatJobLogs(job) : "No command output yet";
  if (output.textContent !== lines) {
    const followOutput = output.scrollHeight - output.scrollTop - output.clientHeight <= 8;
    output.textContent = lines;
    if (followOutput) output.scrollTop = output.scrollHeight;
  }
}

async function refreshCommandJob() {
  const current = state.commandJob;
  if (!current || !["queued", "running"].includes(current.status)) return;
  const job = await api(`/api/jobs/${encodeURIComponent(current.id)}`);
  if (state.commandJob !== current) return;
  state.commandJob = job;
  renderCommandJob(job);
}

function showView(viewId) {
  state.currentView = viewId;
  $$(".app-view").forEach((view) => view.classList.toggle("is-active", view.dataset.view === viewId));
  $$("[data-nav]").forEach((button) => {
    if (button.dataset.nav === viewId) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function focusJob(id, switchToSettings = true) {
  if (!id) return;
  await loadJobs();
  $("#jobSelector").value = id;
  await loadSelectedJobLogs();
  if (switchToSettings) showView("settings");
}

function renderThemeControls() {
  const theme = document.documentElement.dataset.theme || state.manifest.default_theme || "lavender";
  const mode = document.documentElement.dataset.mode || state.manifest.default_mode || "system";
  $$("[data-theme-picker]").forEach((container) => {
    container.innerHTML = Object.entries(themeLabels).map(([value, label]) => `
      <button class="psu-chip" type="button" data-theme-choice="${value}" aria-pressed="${value === theme}">
        ${label}
      </button>
    `).join("");
  });
  $$("[data-mode-picker]").forEach((container) => {
    container.innerHTML = Object.entries(modeLabels).map(([value, label]) => `
      <button type="button" data-mode-choice="${value}" aria-selected="${value === mode}">${label}</button>
    `).join("");
  });
}

function wireEvents() {
  const commandWindow = $("#commandWindow");
  const commandError = $("#commandError");
  $("#openCommandWindow").addEventListener("click", () => {
    commandWindow.showModal();
    refreshCommandJob().catch((error) => { commandError.textContent = error.message; });
  });
  $("#commandForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.command;
    const submit = form.querySelector("button[type='submit']");
    if (submit.disabled) return;
    submit.disabled = true;
    input.readOnly = true;
    commandError.textContent = "";
    try {
      const job = await api("/api/commands", {
        method: "POST",
        body: JSON.stringify({ command: input.value })
      });
      form.reset();
      if (job.kind === "amazon-login") {
        commandWindow.close();
        showView("accounts");
        showAmazonLoginJob(job);
        return;
      }
      state.commandJob = job;
      upsertJob(job);
      renderJobs();
      renderCommandJob(job);
    } catch (error) {
      commandError.textContent = Object.values(error.details || {}).join(" ") || error.message;
    } finally {
      input.readOnly = false;
      submit.disabled = false;
    }
  });
  document.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    const navButton = event.target.closest("[data-nav]");
    const viewButton = event.target.closest("[data-go-view]");
    const themeButton = event.target.closest("[data-theme-choice]");
    const modeButton = event.target.closest("[data-mode-choice]");
    const libraryButton = event.target.closest("#libraryRows button");

    try {
      if (actionButton) await startAction(actionButton.dataset.action);
      if (navButton) showView(navButton.dataset.nav);
      if (viewButton) showView(viewButton.dataset.goView);
      if (themeButton) {
        setPixelSoftUtilityTheme(themeButton.dataset.themeChoice);
        renderThemeControls();
      }
      if (modeButton) {
        setPixelSoftUtilityMode(modeButton.dataset.modeChoice);
        renderThemeControls();
      }
      if (libraryButton?.dataset.liberate) await startAction("liberate", { asin: libraryButton.dataset.liberate });
      if (libraryButton?.dataset.force) await startAction("liberate", { asin: libraryButton.dataset.force, force: true });
      if (libraryButton?.dataset.pdf) await startAction("liberate", { asin: libraryButton.dataset.pdf, pdf: true });
      if (libraryButton?.dataset.status) await startAction("set-status", { asin: libraryButton.dataset.status });
    } catch (error) {
      toast(error.message);
    }
  });

  $("#refreshIpButton").addEventListener("click", async () => {
    await api("/api/public-ip?refresh=1");
    await loadStatus();
    toast("Public IP refreshed");
  });
  $("#loadLibraryButton").addEventListener("click", () => loadLibrary().catch((error) => toast(error.message)));
  $("#loadMoreLibraryButton").addEventListener("click", () => loadLibrary({ append: true }).catch((error) => toast(error.message)));
  $("#librarySearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadLibrary().catch((error) => toast(error.message));
  });
  $("#libraryStatus").addEventListener("change", () => loadLibrary().catch((error) => toast(error.message)));
  $("#librarySort").addEventListener("change", () => loadLibrary().catch((error) => toast(error.message)));

  const libraryObserver = new IntersectionObserver((entries) => {
    const active = $("#library").classList.contains("is-active");
    const hasMore = state.libraryItems.length < state.libraryTotal;
    if (active && hasMore && entries.some((entry) => entry.isIntersecting)) {
      loadLibrary({ append: true }).catch((error) => toast(error.message));
    }
  }, { rootMargin: "360px" });
  libraryObserver.observe($("#librarySentinel"));

  $("#loadAccountsButton").addEventListener("click", () => loadAccounts().catch((error) => toast(error.message)));
  $("#amazonLoginStartForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    renderAmazonErrors(form);
    setFormBusy(form, true);
    try {
      const job = await api("/api/accounts/login-external", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showAmazonLoginJob(job);
    } catch (error) {
      renderAmazonErrors(form, error.details || {});
      toast(error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
  $("#amazonLoginLink").addEventListener("click", () => {
    state.amazonLoginLinkOpened = true;
    renderAmazonLogin();
  });
  $("#amazonLoginCompleteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const responseField = form.elements.responseUrl;
    renderAmazonErrors(form);
    setFormBusy(form, true);
    try {
      const job = await api(`/api/accounts/login-external/${encodeURIComponent(state.activeAmazonLoginId)}/complete`, {
        method: "POST",
        body: JSON.stringify({ responseUrl: responseField.value })
      });
      responseField.value = "";
      upsertJob(job);
      renderJobs();
      toast("Amazon response submitted securely");
    } catch (error) {
      renderAmazonErrors(form, error.details || { responseUrl: error.message });
      toast(error.message);
    } finally {
      setFormBusy(form, false);
    }
  });
  $("#cancelAmazonLoginButton").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      const job = await api(`/api/accounts/login-external/${encodeURIComponent(state.activeAmazonLoginId)}/cancel`, {
        method: "POST"
      });
      upsertJob(job);
      renderJobs();
    } catch (error) {
      toast(error.message);
    } finally {
      event.currentTarget.disabled = false;
    }
  });
  $("#resetAmazonLoginButton").addEventListener("click", () => {
    state.activeAmazonLoginId = null;
    state.amazonLoginLinkOpened = false;
    state.amazonLoginReadyAnnounced = false;
    $("#amazonLoginStartForm").reset();
    renderAmazonLogin();
    $("#amazonLoginStartForm [name='account']").focus();
  });
  $("#importForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const job = await api("/api/accounts/import", {
      method: "POST",
      body: JSON.stringify({ json: form.get("json") })
    });
    toast("Import job started");
    await focusJob(job.id);
  });
  $("#loadSettingsButton").addEventListener("click", () => loadSettings().catch((error) => toast(error.message)));
  $("#saveSettingsButton").addEventListener("click", () => saveSettings("settings").catch((error) => toast(error.message)));
  $("#saveAccountsSettingsButton").addEventListener("click", () => saveSettings("accounts").catch((error) => toast(error.message)));
  $("#loadJobButton").addEventListener("click", () => loadSelectedJobLogs().catch((error) => toast(error.message)));
  $("#accountPanelButton").addEventListener("click", () => showAccountEditor(true));
  $("#accountBackButton").addEventListener("click", () => showAccountEditor(false));
  $("#accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type='submit']");
    $("#accountError").textContent = "";
    submit.disabled = true;
    try {
      const payload = await api("/api/account", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      state.session.user = payload.user;
      renderAuthGate();
      showAccountEditor(false);
      toast("Account saved");
    } catch (error) {
      $("#accountError").textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  $("#logoutButton").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.session = await refreshSession();
    toast("Logged out");
    renderAuthGate();
  });
}

async function loadAppData() {
  if (!state.session?.authenticated) return;
  await Promise.all([loadStatus(), loadJobs(), loadLibrary(), loadAccounts(), loadSettings()]);
}

async function boot() {
  await injectIconSprite();
  await loadManifest();
  renderThemeControls();
  wireEvents();
  await refreshSession();
  renderAuthGate();
  await loadAppData();
  setInterval(async () => {
    if (!state.session?.authenticated) return;
    await Promise.all([loadStatus(), loadJobs()]);
    if (state.selectedJob?.id) await loadSelectedJobLogs();
    if ($("#commandWindow").open) {
      await refreshCommandJob().catch((error) => { $("#commandError").textContent = error.message; });
    }
  }, 5000);
}

function formatStatus(status) {
  if (status === 1) return ["Downloaded", "ok"];
  if (status === 2) return ["Error", "error"];
  return ["Not downloaded", "warn"];
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

boot().catch((error) => {
  $("#authRoot").hidden = false;
  $("#authRoot").innerHTML = setupErrorTemplate(error.message);
});
