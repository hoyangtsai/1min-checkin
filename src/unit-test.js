// Unit tests for core functionality
const crypto = require("node:crypto");
const OTPAuth = require("otpauth");

let passed = 0;
let failed = 0;

function assert(name, condition) {
	if (condition) {
		console.log(`  PASS: ${name}`);
		passed++;
	} else {
		console.log(`  FAIL: ${name}`);
		failed++;
	}
}

console.log("Running unit tests...\n");

// Test 1: TOTP generation
console.log("TOTP functionality:");
try {
	const totp = new OTPAuth.TOTP({
		secret: "JBSWY3DPEHPK3PXP",
		digits: 6,
		period: 30,
		algorithm: "SHA1",
	});
	const code = totp.generate();
	assert("generates 6-digit code", /^\d{6}$/.test(code));
} catch (_error) {
	assert("TOTP generation", false);
}

// Test 2: Device ID generation (crypto-based)
console.log("\nDevice ID generation:");
try {
	const randomHex = (length) =>
		crypto.randomBytes(length).toString("hex").slice(0, length);
	const deviceId = `$device:${randomHex(16)}-${randomHex(15)}-${randomHex(8)}-${randomHex(6)}-${randomHex(16)}`;

	assert("starts with $device:", deviceId.startsWith("$device:"));
	assert(
		"has 5 parts separated by dashes",
		deviceId.replace("$device:", "").split("-").length === 5,
	);
	assert("contains only hex chars", /^\$device:[0-9a-f-]+$/.test(deviceId));

	const deviceId2 = `$device:${randomHex(16)}-${randomHex(15)}-${randomHex(8)}-${randomHex(6)}-${randomHex(16)}`;
	assert("generates unique IDs", deviceId !== deviceId2);
} catch (_error) {
	assert("device ID generation", false);
}

// Test 3: TOTP secret validation
console.log("\nTOTP secret validation:");
function validateTotpSecret(secret) {
	return secret && secret !== "null" && secret.trim() !== "" ? secret : null;
}

assert(
	"valid secret returns secret",
	validateTotpSecret("JBSWY3DPEHPK3PXP") === "JBSWY3DPEHPK3PXP",
);
assert("empty string returns null", validateTotpSecret("") === null);
assert('"null" string returns null', validateTotpSecret("null") === null);
assert("whitespace returns null", validateTotpSecret("  ") === null);
assert("undefined returns null", validateTotpSecret(undefined) === null);
assert("null returns null", validateTotpSecret(null) === null);

// Test 4: Percentage calculation
console.log("\nPercentage calculation:");
function calculatePercent(remainingCredit, usedCredit) {
	const total = remainingCredit + usedCredit;
	return total > 0 ? ((remainingCredit / total) * 100).toFixed(1) : 0;
}

assert("50/100 = 50.0%", calculatePercent(50, 50) === "50.0");
assert("0/0 = 0", calculatePercent(0, 0) === 0);
assert("75/100 = 75.0%", calculatePercent(75, 25) === "75.0");
assert("100/0 = 100.0%", calculatePercent(100, 0) === "100.0");
assert("0/100 = 0.0%", calculatePercent(0, 100) === "0.0");

// Test 5: Email masking edge cases
console.log("\nEmail masking:");
function maskEmail(email) {
	const atIdx = email.indexOf("@");
	return atIdx > 0
		? `${email.substring(0, Math.min(3, atIdx))}***${email.substring(atIdx)}`
		: "***";
}

assert(
	"normal email masked",
	maskEmail("test@example.com") === "tes***@example.com",
);
assert(
	"short local part masked",
	maskEmail("ab@example.com") === "ab***@example.com",
);
assert(
	"single char local part",
	maskEmail("a@example.com") === "a***@example.com",
);
assert("no @ returns ***", maskEmail("noemail") === "***");

// Test 6: Telegram notifier — secret validation + message formatting
console.log("\nTelegram notifier:");
const {
	validateOptionalSecret,
	formatNotificationMessage,
} = require("./notifier.js");

assert(
	"valid secret returns trimmed value",
	validateOptionalSecret("  123:abc  ") === "123:abc",
);
assert("empty string returns null", validateOptionalSecret("") === null);
assert('"null" string returns null', validateOptionalSecret("null") === null);
assert("whitespace returns null", validateOptionalSecret("   ") === null);
assert("undefined returns null", validateOptionalSecret(undefined) === null);
assert("null returns null", validateOptionalSecret(null) === null);

const successMsg = formatNotificationMessage({
	success: true,
	userName: "alice",
	finalCredit: 1500,
	creditDiff: 100,
	availablePercent: "75.0",
});
assert("success message has success marker", successMsg.includes("✅"));
assert("success message has user", successMsg.includes("User: alice"));
assert("success message has balance", successMsg.includes("Balance: 1,500"));
assert("success message has reward", successMsg.includes("Reward: +100"));
assert("success message has percent", successMsg.includes("Available: 75.0%"));

const noRewardMsg = formatNotificationMessage({
	success: true,
	userName: "bob",
	finalCredit: 500,
	creditDiff: 0,
	availablePercent: "50.0",
});
assert(
	"no-reward message notes already checked in",
	noRewardMsg.includes("Reward: none"),
);

const failMsg = formatNotificationMessage({
	success: false,
	error: "Invalid email or password",
});
assert("failure message has failure marker", failMsg.includes("❌"));
assert(
	"failure message includes error",
	failMsg.includes("Invalid email or password"),
);

// Summary
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
}
