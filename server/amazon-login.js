const SUPPORTED_MARKETPLACES = new Set([
  "au",
  "br",
  "ca",
  "de",
  "es",
  "fr",
  "in",
  "it",
  "jp",
  "uk",
  "us"
]);

const TRUSTED_AUTH_DOMAINS = [
  "amazon.com",
  "amazon.ca",
  "amazon.com.mx",
  "amazon.com.br",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.in",
  "amazon.co.jp",
  "amazon.com.au",
  "amazon.nl",
  "amazon.se",
  "amazon.pl",
  "amazon.sg",
  "amazon.com.be",
  "amazon.com.tr",
  "amazon.ae",
  "amazon.sa",
  "amazon.eg",
  "audible.com",
  "audible.ca",
  "audible.co.uk",
  "audible.com.au",
  "audible.de",
  "audible.fr",
  "audible.it",
  "audible.es",
  "audible.in",
  "audible.co.jp",
  "audible.com.br"
];

export const AMAZON_LOGIN_COMMAND =
  'stty -echo; exec "$LIBATION_CLI" login-external --account "$LIBIKU_LOGIN_ACCOUNT" --locale "$LIBIKU_LOGIN_LOCALE"';

export const AMAZON_RESPONSE_URL_MAX_LENGTH = 16_384;

function trustedAuthUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const trusted = TRUSTED_AUTH_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (!trusted || parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  return parsed;
}

export function normalizeAmazonLoginInput(body) {
  const account = String(body?.account || "").trim();
  const locale = String(body?.locale || "").trim().toLowerCase();
  const errors = {};

  if (!account) errors.account = "Amazon account email is required.";
  else if (account.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) {
    errors.account = "Enter the email address used for this Amazon account.";
  }

  if (!SUPPORTED_MARKETPLACES.has(locale)) {
    errors.locale = "Choose the Audible marketplace used by this account.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: { account, locale }
  };
}

export function validateAmazonResponseUrl(value) {
  const responseUrl = String(value || "").trim();
  if (!responseUrl) {
    return { valid: false, error: "Paste the final URL from the browser address bar." };
  }
  if (responseUrl.length > AMAZON_RESPONSE_URL_MAX_LENGTH) {
    return { valid: false, error: "The response URL is too long." };
  }

  const parsed = trustedAuthUrl(responseUrl);
  if (!parsed) {
    return {
      valid: false,
      error: "Use the secure Amazon or Audible URL shown after sign-in."
    };
  }

  return { valid: true, value: parsed.href };
}

export function amazonLoginSpawnSpec({ terminalScript, libationCli, account, locale, baseEnv }) {
  return {
    command: terminalScript,
    args: ["-q", "-e", "-f", "-c", AMAZON_LOGIN_COMMAND, "/dev/null"],
    options: {
      env: {
        ...baseEnv,
        SHELL: "/bin/sh",
        LIBATION_CLI: libationCli,
        LIBIKU_LOGIN_ACCOUNT: account,
        LIBIKU_LOGIN_LOCALE: locale
      },
      stdio: ["pipe", "pipe", "pipe"]
    }
  };
}

function stripTerminalFormatting(value) {
  return String(value || "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

export function findAmazonSignInUrl(line) {
  const clean = stripTerminalFormatting(line);
  const candidates = clean.match(/https:\/\/[^\s<>"']+/gi) || [];
  for (const candidate of candidates) {
    const trimmed = candidate.replace(/[),.;]+$/, "");
    if (trustedAuthUrl(trimmed)) return trimmed;
  }
  return null;
}

export function sanitizeAmazonLoginLogLine(line) {
  const clean = stripTerminalFormatting(line);
  return clean.replace(/https:\/\/[^\s<>"']+/gi, (candidate) => {
    const trimmed = candidate.replace(/[),.;]+$/, "");
    return trustedAuthUrl(trimmed) ? "[Amazon authentication URL hidden]" : candidate;
  });
}

export function isSameOriginBrowserRequest(headers = {}) {
  const fetchSite = String(headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;

  const origin = headers.origin;
  if (!origin) return true;
  if (origin === "null") return false;

  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === String(headers.host || "").toLowerCase();
  } catch {
    return false;
  }
}
