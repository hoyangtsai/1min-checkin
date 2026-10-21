const core = require("@actions/core");
const { validateOptionalSecret } = require("./helpers.js");

const TELEGRAM_TIMEOUT_MS = 10000;
const TELEGRAM_API_BASE = "https://api.telegram.org";

function readTelegramConfig() {
	const token = validateOptionalSecret(
		core.getInput("telegram_bot_token") || process.env.TELEGRAM_BOT_TOKEN,
	);
	const chatId = validateOptionalSecret(
		core.getInput("telegram_chat_id") || process.env.TELEGRAM_CHAT_ID,
	);
	const topicId = validateOptionalSecret(
		core.getInput("telegram_topic_id") || process.env.TELEGRAM_TOPIC_ID,
	);
	return { token, chatId, topicId: parseTopicId(topicId) };
}

// Forum topic (message_thread_id) is a positive integer; ignore anything else
// so a typo still delivers to the chat's general thread instead of failing.
function parseTopicId(value) {
	if (value === null) return null;
	if (/^\d+$/.test(value) && Number(value) > 0) return Number(value);
	core.warning(
		`Telegram topic ID "${value}" is not a positive integer; ignored`,
	);
	return null;
}

// Telegram's HTML mode only requires escaping these three characters.
function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function formatNotificationMessage(outcome) {
	const timestamp = new Date().toISOString();

	if (!outcome.success) {
		return [
			"❌ <b>1min.ai check-in failed</b>",
			"",
			`Error: ${escapeHtml(outcome.error || "Unknown error")}`,
			"",
			`<i>${timestamp}</i>`,
		].join("\n");
	}

	const lines = ["✅ <b>1min.ai check-in success</b>", ""];

	if (outcome.userName) {
		lines.push(`User: ${escapeHtml(outcome.userName)}`);
	}
	if (typeof outcome.finalCredit === "number") {
		lines.push(`Balance: ${outcome.finalCredit.toLocaleString()}`);
	}
	if (typeof outcome.creditDiff === "number" && outcome.creditDiff > 0) {
		lines.push(`Reward: +${outcome.creditDiff.toLocaleString()}`);
	} else if (outcome.creditDiff === 0) {
		lines.push("Reward: none (already checked in today)");
	} else if (outcome.creditDiff === null) {
		lines.push("Reward: unknown (could not read credits)");
	}
	if (typeof outcome.availablePercent === "string") {
		lines.push(`Available: ${outcome.availablePercent}%`);
	}

	lines.push("", `<i>${timestamp}</i>`);
	return lines.join("\n");
}

async function sendTelegramNotification({ token, chatId, topicId, text }) {
	const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: chatId,
				...(topicId && { message_thread_id: topicId }),
				text,
				parse_mode: "HTML",
				disable_web_page_preview: true,
			}),
			signal: controller.signal,
		});

		if (response.status !== 200) {
			core.warning(`Telegram notify failed: HTTP ${response.status}`);
			return { ok: false, error: `HTTP ${response.status}` };
		}

		core.info("Telegram notify: sent");
		return { ok: true };
	} catch (error) {
		const reason = error.name === "AbortError" ? "timeout" : error.message;
		core.warning(`Telegram notify failed: ${reason}`);
		return { ok: false, error: reason };
	} finally {
		clearTimeout(timeoutId);
	}
}

async function notify(outcome) {
	const { token, chatId, topicId } = readTelegramConfig();
	if (!token || !chatId) {
		core.debug("Telegram notify: skipped (secrets not configured)");
		return { ok: false, skipped: true };
	}

	const text = formatNotificationMessage(outcome);
	return await sendTelegramNotification({ token, chatId, topicId, text });
}

module.exports = {
	notify,
	readTelegramConfig,
	escapeHtml,
	formatNotificationMessage,
	sendTelegramNotification,
};
