const core = require("@actions/core");

const TELEGRAM_TIMEOUT_MS = 10000;
const TELEGRAM_API_BASE = "https://api.telegram.org";

function validateOptionalSecret(value) {
	return value && value !== "null" && value.trim() !== "" ? value.trim() : null;
}

function readTelegramConfig() {
	const token = validateOptionalSecret(
		core.getInput("telegram_bot_token") || process.env.TELEGRAM_BOT_TOKEN,
	);
	const chatId = validateOptionalSecret(
		core.getInput("telegram_chat_id") || process.env.TELEGRAM_CHAT_ID,
	);
	return { token, chatId };
}

function formatNotificationMessage(outcome) {
	const timestamp = new Date().toISOString();

	if (!outcome.success) {
		return [
			"❌ *1min.ai check-in failed*",
			"",
			`Error: ${outcome.error || "Unknown error"}`,
			"",
			`_${timestamp}_`,
		].join("\n");
	}

	const lines = ["✅ *1min.ai check-in success*", ""];

	if (outcome.userName) {
		lines.push(`User: ${outcome.userName}`);
	}
	if (typeof outcome.finalCredit === "number") {
		lines.push(`Balance: ${outcome.finalCredit.toLocaleString()}`);
	}
	if (typeof outcome.creditDiff === "number" && outcome.creditDiff > 0) {
		lines.push(`Reward: +${outcome.creditDiff.toLocaleString()}`);
	} else if (outcome.creditDiff === 0) {
		lines.push("Reward: none (already checked in today)");
	}
	if (typeof outcome.availablePercent === "string") {
		lines.push(`Available: ${outcome.availablePercent}%`);
	}

	lines.push("", `_${timestamp}_`);
	return lines.join("\n");
}

async function sendTelegramNotification({ token, chatId, text }) {
	const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: chatId,
				text,
				parse_mode: "Markdown",
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
	const { token, chatId } = readTelegramConfig();
	if (!token || !chatId) {
		core.debug("Telegram notify: skipped (secrets not configured)");
		return { ok: false, skipped: true };
	}

	const text = formatNotificationMessage(outcome);
	return await sendTelegramNotification({ token, chatId, text });
}

module.exports = {
	notify,
	readTelegramConfig,
	formatNotificationMessage,
	sendTelegramNotification,
	validateOptionalSecret,
};
