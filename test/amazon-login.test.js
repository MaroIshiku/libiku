import assert from "node:assert/strict";
import test from "node:test";
import {
  AMAZON_LOGIN_COMMAND,
  AMAZON_RESPONSE_URL_MAX_LENGTH,
  amazonLoginSpawnSpec,
  findAmazonSignInUrl,
  isSameOriginBrowserRequest,
  normalizeAmazonLoginInput,
  sanitizeAmazonLoginLogLine,
  validateAmazonResponseUrl
} from "../server/amazon-login.js";

test("normalizes a supported Amazon account and marketplace", () => {
  assert.deepEqual(normalizeAmazonLoginInput({ account: "  reader@example.com ", locale: "DE" }), {
    valid: true,
    errors: {},
    values: { account: "reader@example.com", locale: "de" }
  });
});

test("rejects malformed account input and unknown marketplaces", () => {
  const result = normalizeAmazonLoginInput({ account: "reader", locale: "moon" });
  assert.equal(result.valid, false);
  assert.match(result.errors.account, /email address/i);
  assert.match(result.errors.locale, /marketplace/i);
});

test("accepts trusted HTTPS Amazon and Audible response URLs", () => {
  for (const responseUrl of [
    "https://www.amazon.com/ap/maplanding?openid.oa2.authorization_code=synthetic",
    "https://www.amazon.de/ap/maplanding?code=synthetic",
    "https://audible.co.uk/ap/maplanding?code=synthetic"
  ]) {
    const result = validateAmazonResponseUrl(responseUrl);
    assert.equal(result.valid, true);
    assert.equal(result.value, responseUrl);
  }
});

test("rejects unsafe or misleading response URLs", () => {
  for (const responseUrl of [
    "",
    "not a URL",
    "http://www.amazon.com/ap/maplanding?code=synthetic",
    "https://amazon.com.evil.example/ap/maplanding?code=synthetic",
    "https://user:password@amazon.com/ap/maplanding?code=synthetic",
    "https://example.com/ap/maplanding?code=synthetic",
    `https://amazon.com/${"x".repeat(AMAZON_RESPONSE_URL_MAX_LENGTH)}`
  ]) {
    assert.equal(validateAmazonResponseUrl(responseUrl).valid, false, responseUrl);
  }
});

test("keeps user input out of the pseudo-terminal wrapper arguments and disables echo", () => {
  const spec = amazonLoginSpawnSpec({
    terminalScript: "/usr/bin/script",
    libationCli: "/libation/LibationCli",
    account: "reader+test@example.com",
    locale: "de",
    baseEnv: { NODE_ENV: "test" }
  });

  assert.equal(spec.command, "/usr/bin/script");
  assert.equal(spec.args.includes(AMAZON_LOGIN_COMMAND), true);
  assert.equal(spec.args.join(" ").includes("reader+test@example.com"), false);
  assert.equal(spec.args.join(" ").includes("--response-url"), false);
  assert.equal(spec.options.env.LIBIKU_LOGIN_ACCOUNT, "reader+test@example.com");
  assert.equal(spec.options.env.LIBIKU_LOGIN_LOCALE, "de");
  assert.equal(spec.options.env.SHELL, "/bin/sh");
  assert.match(AMAZON_LOGIN_COMMAND, /stty -echo/);
});

test("extracts the Amazon sign-in URL and redacts it from job logs", () => {
  const line = "\u001b[32mhttps://www.amazon.de/ap/signin?state=synthetic\u001b[0m";
  assert.equal(findAmazonSignInUrl(line), "https://www.amazon.de/ap/signin?state=synthetic");
  assert.equal(sanitizeAmazonLoginLogLine(line), "[Amazon authentication URL hidden]");
  assert.equal(findAmazonSignInUrl("https://example.com/not-amazon"), null);
});

test("rejects cross-site browser submissions", () => {
  assert.equal(isSameOriginBrowserRequest({ host: "libiku.test", origin: "https://libiku.test", "sec-fetch-site": "same-origin" }), true);
  assert.equal(isSameOriginBrowserRequest({ host: "libiku.test", origin: "https://evil.example", "sec-fetch-site": "cross-site" }), false);
  assert.equal(isSameOriginBrowserRequest({ host: "libiku.test", origin: "null" }), false);
  assert.equal(isSameOriginBrowserRequest({ host: "libiku.test" }), true);
});
