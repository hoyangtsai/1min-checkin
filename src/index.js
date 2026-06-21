const core = require("@actions/core");
const crypto = require("node:crypto");
const OTPAuth = require("otpauth");
const { notify } = require("./notifier.js");

const REQUEST_TIMEOUT_MS = 10000;
const CHECKIN_SETTLE_MS = 3000;
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

class OneMinAutoCheckin {
	constructor() {
		this.email = core.getInput("email") || process.env.EMAIL;
		this.password = core.getInput("password") || process.env.PASSWORD;
		this.totpSecret = this.validateTotpSecret(
			core.getInput("totp_secret") || process.env.TOTP_SECRET,
		);
		this.deviceId = this.generateDeviceId();

		if (!this.email || !this.password) {
			const error = "Missing required parameters: email and password";
			core.setFailed(error);
			throw new Error(error);
		}

		const atIdx = this.email.indexOf("@");
		const masked =
			atIdx > 0
				? `${this.email.substring(0, Math.min(3, atIdx))}***${this.email.substring(atIdx)}`
				: "***";
		core.info(`Account: ${masked}`);
		core.info(`TOTP: ${this.totpSecret ? "Configured" : "Not configured"}`);
	}

	validateTotpSecret(secret) {
		return secret && secret !== "null" && secret.trim() !== "" ? secret : null;
	}

	generateDeviceId() {
		const randomHex = (length) =>
			crypto.randomBytes(length).toString("hex").slice(0, length);

		return `$device:${randomHex(16)}-${randomHex(15)}-${randomHex(8)}-${randomHex(6)}-${randomHex(16)}`;
	}

	buildHeaders(authToken) {
		return {
			Host: "api.1min.ai",
			"Content-Type": "application/json",
			"X-Auth-Token": authToken ? `Bearer ${authToken}` : "Bearer",
			"Mp-Identity": this.deviceId,
			"User-Agent": USER_AGENT,
			Accept: "application/json, text/plain, */*",
			Origin: "https://app.1min.ai",
			Referer: "https://app.1min.ai/",
		};
	}

	async fetchWithTimeout(url, options = {}) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});
			return response;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async login() {
		core.info("Starting login request...");

		const body = JSON.stringify({
			email: this.email,
			password: this.password,
		});

		try {
			const response = await this.fetchWithTimeout(
				"https://api.1min.ai/auth/login",
				{
					method: "POST",
					headers: this.buildHeaders(),
					body,
				},
			);

			const data = await response.json();
			core.info(`Login response status: ${response.status}`);

			if (response.status === 200 && data.user) {
				if (data.user.mfaRequired) {
					core.info("TOTP verification required");
					if (this.totpSecret) {
						return await this.performMFAVerification(data.user.token);
					} else {
						throw new Error("TOTP required but secret key not provided");
					}
				} else {
					core.info("Login successful (no TOTP required)");
					return await this.displayCreditInfo(data);
				}
			} else {
				let errorMsg = "Login failed";
				if (data.message) {
					errorMsg = data.message;
				} else if (response.status === 401) {
					errorMsg = "Invalid email or password";
				} else if (response.status === 429) {
					errorMsg = "Too many requests, please try again later";
				}
				throw new Error(errorMsg);
			}
		} catch (error) {
			if (error.name === "AbortError") {
				throw new Error("Login request timeout");
			}
			throw error;
		}
	}

	async performMFAVerification(tempToken) {
		core.info("Starting TOTP verification process...");

		const totp = new OTPAuth.TOTP({
			secret: this.totpSecret,
			digits: 6,
			period: 30,
			algorithm: "SHA1",
		});

		const totpCode = totp.generate();
		core.info("Generated TOTP verification code");

		const body = JSON.stringify({
			code: totpCode,
			token: tempToken,
		});

		try {
			const response = await this.fetchWithTimeout(
				"https://api.1min.ai/auth/mfa/verify",
				{
					method: "POST",
					headers: this.buildHeaders(),
					body,
				},
			);

			const data = await response.json();
			core.info(`TOTP verification response status: ${response.status}`);

			if (response.status === 200) {
				core.info("TOTP verification successful!");
				return await this.displayCreditInfo(data);
			} else {
				const errorMsg = data.message || `HTTP ${response.status}`;
				throw new Error(errorMsg);
			}
		} catch (error) {
			if (error.name === "AbortError") {
				throw new Error("TOTP verification timeout");
			}
			throw error;
		}
	}

	async displayCreditInfo(responseData) {
		try {
			const user = responseData.user;
			if (!user?.teams || user.teams.length === 0) {
				core.warning("Unable to retrieve credit information");
				core.info("Login successful!");
				return null;
			}

			const authToken = responseData.token || responseData.user?.token;
			const userUuid = user.uuid;

			let targetTeam = null;

			for (const team of user.teams) {
				const subscriptionUserId = team.team?.subscription?.userId;
				if (subscriptionUserId === userUuid) {
					targetTeam = team;
					core.debug(
						`Found matching team: ${team.teamId || team.team?.uuid} (subscription matches user)`,
					);
					break;
				}
			}

			if (!targetTeam && user.teams.length > 0) {
				targetTeam = user.teams[0];
				core.debug(
					`Using fallback team: ${targetTeam.teamId || targetTeam.team?.uuid} (first available)`,
				);
			}

			if (!targetTeam) {
				core.warning("Unable to find any team");
				core.info("Login successful!");
				return null;
			}

			const teamInfo = targetTeam;
			const teamId = teamInfo.teamId || teamInfo.team?.uuid;
			const userName = teamInfo.userName || user.email?.split("@")[0] || "User";
			const usedCredit = teamInfo.usedCredit || 0;
			const initialCredit = teamInfo.team?.credit || 0;

			core.info(`User: ${userName}`);
			core.debug(`Team ID: ${teamId}`);
			core.info(`Initial Credit: ${initialCredit.toLocaleString()}`);

			if (!teamId || !authToken) {
				const percent = this.calculatePercent(initialCredit, usedCredit);
				core.info(
					`${userName} login successful | Balance: ${initialCredit.toLocaleString()} (${percent}%)`,
				);
				return {
					userName,
					finalCredit: initialCredit,
					creditDiff: 0,
					availablePercent: String(percent),
				};
			}

			return await this.fetchLatestCredit(
				teamId,
				authToken,
				userName,
				usedCredit,
				initialCredit,
			);
		} catch (error) {
			core.error(`Error displaying credit information: ${error.message}`);
			core.info("Login successful!");
			return null;
		}
	}

	async fetchLatestCredit(
		teamId,
		authToken,
		userName,
		usedCredit,
		initialCredit = 0,
	) {
		core.debug(`Starting credit check process (Team ID: ${teamId})`);
		core.debug("Auth token: [present]");

		const headers = this.buildHeaders(authToken);

		// Get current credit (or use provided initial credit)
		const currentCredit =
			initialCredit > 0
				? initialCredit
				: await this.getCredits(teamId, headers);
		core.info(`Current credits: ${currentCredit.toLocaleString()}`);

		// Check unread notifications to trigger check-in
		await this.checkUnreadNotifications(headers);

		// Wait for check-in reward to settle before re-checking credits
		await new Promise((resolve) => setTimeout(resolve, CHECKIN_SETTLE_MS));
		const finalCredit = await this.getCredits(teamId, headers);
		core.info(`Final credits: ${finalCredit.toLocaleString()}`);

		const creditDiff = finalCredit - currentCredit;
		let message = `${userName} | Balance: ${finalCredit.toLocaleString()}`;

		if (creditDiff > 0) {
			core.info(
				`Check-in reward received: +${creditDiff.toLocaleString()} credits`,
			);
			message += ` (+${creditDiff.toLocaleString()})`;
		} else if (creditDiff === 0) {
			core.info("Already checked in today or no check-in reward");
		} else {
			core.warning(`Credits decreased: ${creditDiff.toLocaleString()}`);
		}

		const totalCredit = finalCredit + usedCredit;
		const availablePercent =
			totalCredit > 0 ? ((finalCredit / totalCredit) * 100).toFixed(1) : "0";
		message += ` (${availablePercent}%)`;

		core.info(message);

		return { userName, finalCredit, creditDiff, availablePercent };
	}

	async getCredits(teamId, headers) {
		const creditUrl = `https://api.1min.ai/teams/${teamId}/credits`;
		core.debug(`Requesting credit URL: ${creditUrl}`);

		try {
			const response = await this.fetchWithTimeout(creditUrl, { headers });
			core.debug(`Credit API status: ${response.status}`);

			if (response.status === 200) {
				const creditData = await response.json();
				return creditData.credit || 0;
			} else {
				core.warning(`Credit API failed - Status: ${response.status}`);
				return 0;
			}
		} catch (error) {
			const reason = error.name === "AbortError" ? "timeout" : error.message;
			core.warning(`Credit API error: ${reason}`);
			return 0;
		}
	}

	async checkUnreadNotifications(headers) {
		const notificationUrl = "https://api.1min.ai/notifications/unread";
		core.debug(`Checking unread notifications: ${notificationUrl}`);

		try {
			const response = await this.fetchWithTimeout(notificationUrl, {
				headers,
			});
			core.debug(`Notification API status: ${response.status}`);

			if (response.status === 200) {
				const notificationData = await response.json();
				core.info(`Unread notifications: ${notificationData.count || 0}`);
			} else {
				core.warning(`Notification API failed - Status: ${response.status}`);
			}
		} catch (error) {
			const reason = error.name === "AbortError" ? "timeout" : error.message;
			core.warning(`Notification API error: ${reason}`);
		}
	}

	calculatePercent(remainingCredit, usedCredit) {
		const total = remainingCredit + usedCredit;
		return total > 0 ? ((remainingCredit / total) * 100).toFixed(1) : 0;
	}

	async run() {
		let outcome;
		try {
			core.info("1min.ai auto checkin started");
			core.info(`Execution time: ${new Date().toISOString()}`);

			const loginResult = await this.login();

			core.info("Checkin process completed");
			core.setOutput("success", "true");
			core.setOutput("message", "Checkin successful");

			outcome = {
				success: true,
				userName: loginResult?.userName,
				finalCredit: loginResult?.finalCredit,
				creditDiff: loginResult?.creditDiff,
				availablePercent: loginResult?.availablePercent,
			};
			await notify(outcome);
			return true;
		} catch (error) {
			core.error(`Checkin process failed: ${error.message}`);
			core.setFailed(error.message);
			core.setOutput("success", "false");
			core.setOutput("message", error.message);

			outcome = { success: false, error: error.message };
			try {
				await notify(outcome);
			} catch (notifyError) {
				core.warning(`Notify error: ${notifyError.message}`);
			}
			process.exit(1);
		}
	}
}

// Execute checkin
if (require.main === module) {
	const checkin = new OneMinAutoCheckin();
	checkin.run();
}

module.exports = OneMinAutoCheckin;
