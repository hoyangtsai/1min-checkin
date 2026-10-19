const crypto = require("node:crypto");

// GitHub passes unset secrets as "" (or the literal "null" in some setups).
function validateOptionalSecret(value) {
	return value && value !== "null" && value.trim() !== "" ? value.trim() : null;
}

function maskEmail(email) {
	const atIdx = email.indexOf("@");
	return atIdx > 0
		? `${email.substring(0, Math.min(3, atIdx))}***${email.substring(atIdx)}`
		: "***";
}

function generateDeviceId() {
	const randomHex = (length) =>
		crypto.randomBytes(length).toString("hex").slice(0, length);

	return `$device:${randomHex(16)}-${randomHex(15)}-${randomHex(8)}-${randomHex(6)}-${randomHex(16)}`;
}

function calculatePercent(remainingCredit, usedCredit) {
	const total = remainingCredit + usedCredit;
	return total > 0 ? ((remainingCredit / total) * 100).toFixed(1) : "0.0";
}

module.exports = {
	validateOptionalSecret,
	maskEmail,
	generateDeviceId,
	calculatePercent,
};
