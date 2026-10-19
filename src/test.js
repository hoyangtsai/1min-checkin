// Live run against 1min.ai for local development. Requires EMAIL and PASSWORD.
const OneMinAutoCheckin = require("./index.js");

if (!process.env.EMAIL || !process.env.PASSWORD) {
	console.log("⚠️  Please set environment variables for testing:");
	console.log('export EMAIL="your-email@example.com"');
	console.log('export PASSWORD="your-password"');
	console.log('export TOTP_SECRET="your-totp-secret"  # Optional');
	process.exit(1);
}

new OneMinAutoCheckin().run().then((ok) => {
	console.log(ok ? "✅ Test completed" : "❌ Test failed");
	if (!ok) process.exitCode = 1;
});
