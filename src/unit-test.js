// Offline unit tests. Run: npm run unit-test
// Single test: node --test --test-name-pattern="<name>" src/unit-test.js
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const core = require("@actions/core");
const OTPAuth = require("otpauth");
const {
	validateOptionalSecret,
	maskEmail,
	generateDeviceId,
	calculatePercent,
} = require("./helpers.js");
const { escapeHtml, formatNotificationMessage } = require("./notifier.js");
const OneMinAutoCheckin = require("./index.js");

// Under GitHub Actions, the failures these tests provoke on purpose would print
// ::error:: / ::warning:: commands and show up as real annotations on the run.
// setFailed would also set process.exitCode, and setOutput would write to the
// step's GITHUB_OUTPUT file.
for (const fn of ["error", "warning", "setFailed", "setOutput"]) {
	core[fn] = () => {};
}

const ENV_KEYS = [
	"EMAIL",
	"PASSWORD",
	"TOTP_SECRET",
	"TELEGRAM_BOT_TOKEN",
	"TELEGRAM_CHAT_ID",
	"TELEGRAM_TOPIC_ID",
];

function jsonResponse(status, body) {
	return new Response(JSON.stringify(body), { status });
}

// Routes fetch calls by URL substring and records every call.
function mockFetch(routes) {
	const calls = [];
	globalThis.fetch = async (url, options = {}) => {
		calls.push({ url, options });
		for (const [pattern, handler] of Object.entries(routes)) {
			if (url.includes(pattern)) return handler(calls);
		}
		throw new Error(`Unmocked URL: ${url}`);
	};
	return calls;
}

let savedEnv;
let savedFetch;
beforeEach(() => {
	savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
	for (const k of ENV_KEYS) delete process.env[k];
	savedFetch = globalThis.fetch;
});
afterEach(() => {
	for (const k of ENV_KEYS) {
		if (savedEnv[k] === undefined) delete process.env[k];
		else process.env[k] = savedEnv[k];
	}
	globalThis.fetch = savedFetch;
});

describe("helpers", () => {
	it("generates a 6-digit TOTP code", () => {
		const totp = new OTPAuth.TOTP({ secret: "JBSWY3DPEHPK3PXP" });
		assert.match(totp.generate(), /^\d{6}$/);
	});

	it("generates unique hex device ids", () => {
		const id = generateDeviceId();
		assert.match(id, /^\$device:[0-9a-f]+(-[0-9a-f]+){4}$/);
		assert.notEqual(id, generateDeviceId());
	});

	it("validateOptionalSecret treats blank and 'null' as unset", () => {
		assert.equal(validateOptionalSecret("  123:abc  "), "123:abc");
		for (const v of ["", "null", "   ", undefined, null]) {
			assert.equal(validateOptionalSecret(v), null);
		}
	});

	it("calculatePercent always returns a string", () => {
		assert.equal(calculatePercent(50, 50), "50.0");
		assert.equal(calculatePercent(0, 0), "0.0");
		assert.equal(calculatePercent(100, 0), "100.0");
		assert.equal(calculatePercent(0, 100), "0.0");
	});

	it("maskEmail hides the local part", () => {
		assert.equal(maskEmail("test@example.com"), "tes***@example.com");
		assert.equal(maskEmail("ab@example.com"), "ab***@example.com");
		assert.equal(maskEmail("noemail"), "***");
	});
});

describe("notifier", () => {
	it("escapes HTML special characters", () => {
		assert.equal(escapeHtml("a<b>&c"), "a&lt;b&gt;&amp;c");
	});

	it("formats a success message", () => {
		const msg = formatNotificationMessage({
			success: true,
			userName: "alice_smith",
			finalCredit: 1500,
			creditDiff: 100,
			availablePercent: "75.0",
		});
		assert.ok(msg.includes("✅"));
		assert.ok(msg.includes("User: alice_smith"));
		assert.ok(msg.includes("Balance: 1,500"));
		assert.ok(msg.includes("Reward: +100"));
		assert.ok(msg.includes("Available: 75.0%"));
	});

	it("distinguishes no reward from unknown reward", () => {
		const base = { success: true, finalCredit: 500 };
		assert.ok(
			formatNotificationMessage({ ...base, creditDiff: 0 }).includes(
				"Reward: none",
			),
		);
		assert.ok(
			formatNotificationMessage({ ...base, creditDiff: null }).includes(
				"Reward: unknown",
			),
		);
	});

	it("escapes the error in a failure message", () => {
		const msg = formatNotificationMessage({
			success: false,
			error: "bad <token>",
		});
		assert.ok(msg.includes("❌"));
		assert.ok(msg.includes("bad &lt;token&gt;"));
	});
});

describe("check-in", () => {
	const opts = { pollIntervalMs: 0, retryDelayMs: 0 };

	const topup = (createdAt, credit = 15000) => ({
		type: "DAILY_FREE_CREDIT",
		credit,
		createdAt: new Date(createdAt).toISOString(),
	});

	it("reports unknown reward when the credit history can't be read", async () => {
		mockFetch({
			"/notifications/unread": () => jsonResponse(200, { count: 0 }),
			"/topups": () => jsonResponse(500, {}),
			"/credits": () => jsonResponse(500, {}),
		});
		const checkin = new OneMinAutoCheckin(opts);
		const result = await checkin.fetchLatestCredit("t1", "tok", "u", 0, 0);
		assert.equal(result.creditDiff, null);
		assert.equal(result.finalCredit, null);
	});

	it("keeps polling until this run's daily topup appears", async () => {
		const checkin = new OneMinAutoCheckin(opts);
		const old = topup(checkin.startedAt - 86400000);
		let reads = 0;
		mockFetch({
			"/notifications/unread": () => jsonResponse(200, { count: 0 }),
			"/topups": () =>
				jsonResponse(200, {
					topupList:
						++reads < 3 ? [old] : [topup(checkin.startedAt + 3000), old],
				}),
			"/credits": () => jsonResponse(200, { credit: 16000 }),
		});
		const result = await checkin.fetchLatestCredit("t1", "tok", "u", 0, 1000);
		assert.equal(result.creditDiff, 15000);
		assert.equal(result.finalCredit, 16000);
		assert.equal(reads, 3);
	});

	it("reports the earlier claim when today's reward was already taken", async () => {
		const checkin = new OneMinAutoCheckin({ ...opts, pollAttempts: 4 });
		const earlier = topup(checkin.startedAt - 3600000);
		let reads = 0;
		mockFetch({
			"/notifications/unread": () => jsonResponse(200, { count: 0 }),
			"/topups": () => {
				reads++;
				return jsonResponse(200, { topupList: [earlier] });
			},
			"/credits": () => jsonResponse(200, { credit: 1000 }),
		});
		const result = await checkin.fetchLatestCredit("t1", "tok", "u", 0, 1000);
		assert.equal(result.creditDiff, 0);
		assert.equal(result.lastClaimAt, earlier.createdAt);
		assert.equal(reads, 4);
	});

	it("retries 5xx responses and then succeeds", async () => {
		let attempts = 0;
		mockFetch({
			"/credits": () =>
				++attempts < 3
					? jsonResponse(503, {})
					: jsonResponse(200, { credit: 42 }),
		});
		const checkin = new OneMinAutoCheckin(opts);
		assert.equal(await checkin.getCredits("t1", {}), 42);
		assert.equal(attempts, 3);
	});

	it("does not retry 401 on login", async () => {
		process.env.EMAIL = "a@b.com";
		process.env.PASSWORD = "x";
		const calls = mockFetch({
			"/auth/login": () => jsonResponse(401, {}),
		});
		const checkin = new OneMinAutoCheckin(opts);
		await assert.rejects(checkin.login(), /Invalid email or password/);
		assert.equal(calls.length, 1);
	});

	it("sends a failure notification when credentials are missing", async () => {
		process.env.TELEGRAM_BOT_TOKEN = "123:abc";
		process.env.TELEGRAM_CHAT_ID = "42";
		const calls = mockFetch({
			"api.telegram.org": () => jsonResponse(200, { ok: true }),
		});
		const ok = await new OneMinAutoCheckin(opts).run();
		assert.equal(ok, false);
		assert.equal(calls.length, 1);
		const body = JSON.parse(calls[0].options.body);
		assert.equal(body.parse_mode, "HTML");
		assert.ok(body.text.includes("Missing required parameters"));
		assert.equal(body.message_thread_id, undefined);
	});

	it("posts into the configured Telegram topic", async () => {
		process.env.TELEGRAM_BOT_TOKEN = "123:abc";
		process.env.TELEGRAM_CHAT_ID = "-10042";
		process.env.TELEGRAM_TOPIC_ID = "7";
		const calls = mockFetch({
			"api.telegram.org": () => jsonResponse(200, { ok: true }),
		});
		await new OneMinAutoCheckin(opts).run();
		assert.equal(JSON.parse(calls[0].options.body).message_thread_id, 7);
	});

	it("ignores an invalid Telegram topic ID", async () => {
		process.env.TELEGRAM_BOT_TOKEN = "123:abc";
		process.env.TELEGRAM_CHAT_ID = "-10042";
		process.env.TELEGRAM_TOPIC_ID = "general";
		const calls = mockFetch({
			"api.telegram.org": () => jsonResponse(200, { ok: true }),
		});
		await new OneMinAutoCheckin(opts).run();
		assert.equal(calls.length, 1);
		assert.equal(
			JSON.parse(calls[0].options.body).message_thread_id,
			undefined,
		);
	});
});
