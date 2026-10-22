const core = require("@actions/core");
const OTPAuth = require("otpauth");
const { notify } = require("./notifier.js");
const {
	validateOptionalSecret,
	maskEmail,
	generateDeviceId,
	calculatePercent,
} = require("./helpers.js");

const REQUEST_TIMEOUT_MS = 10000;
// The reward shows up in the credit history a few seconds after the request
// that triggers it, so poll the history for up to ~30 seconds.
const TOPUP_POLL_INTERVAL_MS = 5000;
const TOPUP_POLL_ATTEMPTS = 6;
const DAILY_TOPUP_TYPE = "DAILY_FREE_CREDIT";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2000;
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status) {
	return status === 429 || status >= 500;
}

class OneMinAutoCheckin {
	constructor(options = {}) {
		this.email = core.getInput("email") || process.env.EMAIL;
		this.password = core.getInput("password") || process.env.PASSWORD;
		this.totpSecret = validateOptionalSecret(
			core.getInput("totp_secret") || process.env.TOTP_SECRET,
		);
		this.deviceId = generateDeviceId();
		this.pollIntervalMs = options.pollIntervalMs ?? TOPUP_POLL_INTERVAL_MS;
		this.pollAttempts = options.pollAttempts ?? TOPUP_POLL_ATTEMPTS;
		// A daily topup created after this moment was claimed by this run.
		this.startedAt = Date.now();
		this.retryDelayMs = options.retryDelayMs ?? RETRY_BASE_DELAY_MS;
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
			return await fetch(url, { ...options, signal: controller.signal });
		} finally {
			clearTimeout(timeoutId);
		}
	}

	// Retries network errors, timeouts, 429 and 5xx. Other statuses are returned as-is.
	async fetchWithRetry(url, options = {}) {
		for (let attempt = 1; ; attempt++) {
			try {
				const response = await this.fetchWithTimeout(url, options);
				if (!isRetryableStatus(response.status) || attempt >= MAX_ATTEMPTS) {
					return response;
				}
				core.warning(
					`HTTP ${response.status} from ${url}, retrying (${attempt}/${MAX_ATTEMPTS - 1})`,
				);
			} catch (error) {
				if (attempt >= MAX_ATTEMPTS) throw error;
				const reason = error.name === "AbortError" ? "timeout" : error.message;
				core.warning(
					`Request to ${url} failed (${reason}), retrying (${attempt}/${MAX_ATTEMPTS - 1})`,
				);
			}
			await sleep(this.retryDelayMs * attempt);
		}
	}

	async login() {
		core.info("Starting login request...");

		const body = JSON.stringify({
			email: this.email,
			password: this.password,
		});

		try {
			const response = await this.fetchWithRetry(
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
					}
					throw new Error("TOTP required but secret key not provided");
				}
				core.info("Login successful (no TOTP required)");
				return await this.displayCreditInfo(data);
			}

			let errorMsg = "Login failed";
			if (data.message) {
				errorMsg = data.message;
			} else if (response.status === 401) {
				errorMsg = "Invalid email or password";
			} else if (response.status === 429) {
				errorMsg = "Too many requests, please try again later";
			}
			throw new Error(errorMsg);
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

		// Not retried: a retry could reuse a code that has already expired or been consumed.
		const body = JSON.stringify({
			code: totp.generate(),
			token: tempToken,
		});
		core.info("Generated TOTP verification code");

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
			}
			throw new Error(data.message || `HTTP ${response.status}`);
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
			const targetTeam =
				user.teams.find(
					(team) => team.team?.subscription?.userId === user.uuid,
				) || user.teams[0];

			const teamId = targetTeam.teamId || targetTeam.team?.uuid;
			const userName =
				targetTeam.userName || user.email?.split("@")[0] || "User";
			const usedCredit = targetTeam.usedCredit || 0;
			const initialCredit = targetTeam.team?.credit || 0;

			core.info(`User: ${userName}`);
			core.debug(`Team ID: ${teamId}`);
			core.info(`Initial Credit: ${initialCredit.toLocaleString()}`);

			if (!teamId || !authToken) {
				const percent = calculatePercent(initialCredit, usedCredit);
				core.info(
					`${userName} login successful | Balance: ${initialCredit.toLocaleString()} (${percent}%)`,
				);
				return {
					userName,
					finalCredit: initialCredit,
					creditDiff: null,
					availablePercent: percent,
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

	// Waits for a DAILY_FREE_CREDIT topup created during this run. Resolves to
	// { claimed, credit, createdAt } for the newest daily topup seen, or null if
	// the credit history could never be read.
	async pollDailyTopup(teamId, headers) {
		let readOnce = false;
		let latest;
		for (let attempt = 1; attempt <= this.pollAttempts; attempt++) {
			await sleep(this.pollIntervalMs);
			const topups = await this.getTopups(teamId, headers);
			if (topups === null) continue;
			readOnce = true;
			latest = topups.find((topup) => topup.type === DAILY_TOPUP_TYPE);
			if (latest && Date.parse(latest.createdAt) >= this.startedAt) {
				return {
					claimed: true,
					credit: latest.credit,
					createdAt: latest.createdAt,
				};
			}
			core.info(`Daily reward not seen yet (${attempt}/${this.pollAttempts})`);
		}
		if (!readOnce) return null;
		return { claimed: false, createdAt: latest?.createdAt ?? null };
	}

	async fetchLatestCredit(
		teamId,
		authToken,
		userName,
		usedCredit,
		initialCredit = 0,
	) {
		core.debug(`Starting credit check process (Team ID: ${teamId})`);

		const headers = this.buildHeaders(authToken);

		const currentCredit =
			initialCredit > 0
				? initialCredit
				: await this.getCredits(teamId, headers);
		if (currentCredit !== null) {
			core.info(`Current credits: ${currentCredit.toLocaleString()}`);
		}

		// Hitting the unread-notifications endpoint is what triggers the daily reward.
		await this.checkUnreadNotifications(headers);

		const daily = await this.pollDailyTopup(teamId, headers);
		const finalCredit =
			(await this.getCredits(teamId, headers)) ?? currentCredit;

		let creditDiff = null;
		if (daily === null) {
			core.warning("Unable to read credit history; reward unknown");
		} else if (daily.claimed) {
			creditDiff = daily.credit;
			core.info(
				`Check-in reward received: +${creditDiff.toLocaleString()} credits`,
			);
		} else {
			creditDiff = 0;
			core.info(
				`No reward: already claimed at ${daily.createdAt ?? "unknown time"}`,
			);
		}

		if (finalCredit === null) {
			return { userName, finalCredit, creditDiff, lastClaimAt: null };
		}
		core.info(`Final credits: ${finalCredit.toLocaleString()}`);

		const availablePercent = calculatePercent(finalCredit, usedCredit);
		let message = `${userName} | Balance: ${finalCredit.toLocaleString()}`;
		if (creditDiff > 0) message += ` (+${creditDiff.toLocaleString()})`;
		message += ` (${availablePercent}%)`;
		core.info(message);

		return {
			userName,
			finalCredit,
			creditDiff,
			lastClaimAt: daily?.createdAt ?? null,
			availablePercent,
		};
	}

	// Newest-first credit history (daily rewards, purchases); null on failure.
	async getTopups(teamId, headers) {
		const topupUrl = `https://api.1min.ai/teams/${teamId}/topups?page=1&pageSize=10&orderBy=-createdAt`;

		try {
			const response = await this.fetchWithRetry(topupUrl, { headers });
			if (response.status !== 200) {
				core.warning(`Topup API failed - Status: ${response.status}`);
				return null;
			}
			const data = await response.json();
			return Array.isArray(data.topupList) ? data.topupList : null;
		} catch (error) {
			const reason = error.name === "AbortError" ? "timeout" : error.message;
			core.warning(`Topup API error: ${reason}`);
			return null;
		}
	}

	// Returns null when the balance could not be read, so callers never mistake a failure for 0.
	async getCredits(teamId, headers) {
		const creditUrl = `https://api.1min.ai/teams/${teamId}/credits`;
		core.debug(`Requesting credit URL: ${creditUrl}`);

		try {
			const response = await this.fetchWithRetry(creditUrl, { headers });
			core.debug(`Credit API status: ${response.status}`);

			if (response.status !== 200) {
				core.warning(`Credit API failed - Status: ${response.status}`);
				return null;
			}
			const creditData = await response.json();
			return typeof creditData.credit === "number" ? creditData.credit : null;
		} catch (error) {
			const reason = error.name === "AbortError" ? "timeout" : error.message;
			core.warning(`Credit API error: ${reason}`);
			return null;
		}
	}

	async checkUnreadNotifications(headers) {
		const notificationUrl = "https://api.1min.ai/notifications/unread";
		core.debug(`Checking unread notifications: ${notificationUrl}`);

		try {
			const response = await this.fetchWithRetry(notificationUrl, {
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

	async run() {
		try {
			core.info("1min.ai auto checkin started");
			core.info(`Execution time: ${new Date().toISOString()}`);

			if (!this.email || !this.password) {
				throw new Error("Missing required parameters: email and password");
			}
			core.info(`Account: ${maskEmail(this.email)}`);
			core.info(`TOTP: ${this.totpSecret ? "Configured" : "Not configured"}`);

			const loginResult = await this.login();

			core.info("Checkin process completed");
			core.setOutput("success", "true");
			core.setOutput("message", "Checkin successful");

			await notify({
				success: true,
				userName: loginResult?.userName,
				finalCredit: loginResult?.finalCredit,
				creditDiff: loginResult?.creditDiff,
				lastClaimAt: loginResult?.lastClaimAt,
				availablePercent: loginResult?.availablePercent,
			});
			return true;
		} catch (error) {
			core.error(`Checkin process failed: ${error.message}`);
			core.setFailed(error.message);
			core.setOutput("success", "false");
			core.setOutput("message", error.message);

			try {
				await notify({ success: false, error: error.message });
			} catch (notifyError) {
				core.warning(`Notify error: ${notifyError.message}`);
			}
			return false;
		}
	}
}

if (require.main === module) {
	new OneMinAutoCheckin().run().then((ok) => {
		if (!ok) process.exitCode = 1;
	});
}

module.exports = OneMinAutoCheckin;
