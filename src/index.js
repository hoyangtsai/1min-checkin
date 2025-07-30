const core = require('@actions/core');
const OTPAuth = require('otpauth');

class OneMinAutoCheckin {
    constructor() {
        // Prioritize GitHub Action inputs, then environment variables
        this.email = core.getInput('email') || process.env.EMAIL;
        this.password = core.getInput('password') || process.env.PASSWORD;
        this.totpSecret = this.validateTotpSecret(core.getInput('totp_secret') || process.env.TOTP_SECRET);
        this.deviceId = this.generateDeviceId();
        
        if (!this.email || !this.password) {
            const error = 'Missing required parameters: email and password';
            core.setFailed(error);
            throw new Error(error);
        }
        
        console.log(`📧 Account: ${this.email.substring(0, 3)}***${this.email.substring(this.email.indexOf('@'))}`);
        console.log(`🔐 TOTP: ${this.totpSecret ? 'Configured' : 'Not configured'}`);
    }

    validateTotpSecret(secret) {
        // Filter invalid TOTP values (empty string, null string, etc.)
        return secret && secret !== 'null' && secret.trim() !== '' ? secret : null;
    }

    generateDeviceId() {
        const chars = '0123456789abcdef';
        const randomString = (length) =>
            Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

        // Generate more realistic random combinations
        const part1 = randomString(16);
        const part2 = randomString(15);
        const part3 = randomString(8);  // Replace fixed 17525636
        const part4 = randomString(6);  // Replace fixed 16a7f0
        const part5 = randomString(16); // Replace duplicate part1

        return `$device:${part1}-${part2}-${part3}-${part4}-${part5}`;
    }

    async login() {
        console.log('🚀 Starting login request...');
        
        const loginUrl = 'https://api.1min.ai/auth/login';
        const headers = {
            'Host': 'api.1min.ai',
            'Content-Type': 'application/json',
            'X-Auth-Token': 'Bearer',
            'Mp-Identity': this.deviceId,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://app.1min.ai',
            'Referer': 'https://app.1min.ai/'
        };

        const body = JSON.stringify({
            email: this.email,
            password: this.password
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(loginUrl, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();
            console.log(`📊 Login response status: ${response.status}`);

            if (response.status === 200 && data.user) {
                if (data.user.mfaRequired) {
                    console.log('🔐 TOTP verification required');
                    if (this.totpSecret) {
                        return await this.performMFAVerification(data.user.token);
                    } else {
                        throw new Error('TOTP required but secret key not provided');
                    }
                } else {
                    console.log('✅ Login successful (no TOTP required)');
                    await this.displayCreditInfo(data);
                    return data;
                }
            } else {
                let errorMsg = 'Login failed';
                if (data.message) {
                    errorMsg = data.message;
                } else if (response.status === 401) {
                    errorMsg = 'Invalid email or password';
                } else if (response.status === 429) {
                    errorMsg = 'Too many requests, please try again later';
                }
                throw new Error(errorMsg);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('❌ Login request timeout');
                throw new Error('Login request timeout');
            } else {
                console.error('❌ Login failed:', error.message);
                throw error;
            }
        }
    }

    async performMFAVerification(tempToken) {
        console.log('🔐 Starting TOTP verification process...');

        const totp = new OTPAuth.TOTP({
            secret: this.totpSecret,
            digits: 6,
            period: 30,
            algorithm: 'SHA1'
        });

        const totpCode = totp.generate();
        console.log('🎯 Generated TOTP verification code');

        const mfaUrl = 'https://api.1min.ai/auth/mfa/verify';
        const headers = {
            'Host': 'api.1min.ai',
            'Content-Type': 'application/json',
            'X-Auth-Token': 'Bearer',
            'Mp-Identity': this.deviceId,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://app.1min.ai',
            'Referer': 'https://app.1min.ai/'
        };

        const body = JSON.stringify({
            code: totpCode,
            token: tempToken
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(mfaUrl, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();
            console.log(`📊 TOTP verification response status: ${response.status}`);

            if (response.status === 200) {
                console.log('✅ TOTP verification successful!');
                await this.displayCreditInfo(data);
                return data;
            } else {
                const errorMsg = data.message || `HTTP ${response.status}`;
                throw new Error(errorMsg);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('❌ TOTP verification timeout');
                throw new Error('TOTP verification timeout');
            } else {
                console.error('❌ TOTP verification failed:', error.message);
                throw error;
            }
        }
    }

    async displayCreditInfo(responseData) {
        try {
            const user = responseData.user;
            if (!user?.teams || user.teams.length === 0) {
                console.log('⚠️ Unable to retrieve credit information');
                console.log('✅ Login successful!');
                return;
            }

            const authToken = responseData.token || responseData.user?.token;
            const userUuid = user.uuid;

            // Find the team that matches the current user (subscription.userId matches current user uuid)
            let targetTeam = null;

            for (const team of user.teams) {
                const subscriptionUserId = team.team?.subscription?.userId;
                if (subscriptionUserId === userUuid) {
                    targetTeam = team;
                    console.log(`🎯 Found matching team: ${team.teamId || team.team?.uuid} (subscription matches user)`);
                    break;
                }
            }

            // If no matching team found, use the first team as fallback
            if (!targetTeam && user.teams.length > 0) {
                targetTeam = user.teams[0];
                console.log(`📋 Using fallback team: ${targetTeam.teamId || targetTeam.team?.uuid} (first available)`);
            }

            if (!targetTeam) {
                console.log('❌ Unable to find any team');
                console.log('✅ Login successful!');
                return;
            }

            const teamInfo = targetTeam;
            const teamId = teamInfo.teamId || teamInfo.team?.uuid;
            const userName = teamInfo.userName || user.email?.split('@')[0] || 'User';
            const usedCredit = teamInfo.usedCredit || 0;
            const initialCredit = teamInfo.team?.credit || 0;

            console.log(`👤 User: ${userName}`);
            console.log(`🏢 Team ID: ${teamId}`);
            console.log(`💰 Initial Credit: ${initialCredit.toLocaleString()}`);

            if (!teamId || !authToken) {
                const percent = this.calculatePercent(initialCredit, usedCredit);
                console.log(`✅ ${userName} login successful | Balance: ${initialCredit.toLocaleString()} (${percent}%)`);
                return;
            }

            // Check daily bonus
            await this.fetchLatestCredit(teamId, authToken, userName, usedCredit, initialCredit);
        } catch (error) {
            console.error('❌ Error displaying credit information:', error.message);
            console.log('✅ Login successful!');
        }
    }

    async fetchLatestCredit(teamId, authToken, userName, usedCredit, initialCredit = 0) {
        console.log(`🔄 Starting credit check process (Team ID: ${teamId})`);
        console.log(`🔑 Using Token: ${authToken ? authToken.substring(0, 10) + '...' : 'null'}`);

        const headers = {
            'Host': 'api.1min.ai',
            'Content-Type': 'application/json',
            'X-Auth-Token': `Bearer ${authToken}`,
            'Mp-Identity': this.deviceId,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://app.1min.ai',
            'Referer': 'https://app.1min.ai/'
        };

        // Step 1: Get current credit (or use provided initial credit)
        const currentCredit = initialCredit > 0 ? initialCredit : await this.getCredits(teamId, authToken, headers);
        console.log(`💰 Current credits: ${currentCredit.toLocaleString()}`);

        // Step 2: Check unread notifications to trigger check-in
        await this.checkUnreadNotifications(authToken, headers);

        // Step 3: Wait 3 seconds and get final credit to detect rewards
        await new Promise(resolve => setTimeout(resolve, 3000));
        const finalCredit = await this.getCredits(teamId, authToken, headers);
        console.log(`💰 Final credits: ${finalCredit.toLocaleString()}`);

        const creditDiff = finalCredit - currentCredit;
        let message = `${userName} | Balance: ${finalCredit.toLocaleString()}`;

        if (creditDiff > 0) {
            console.log(`🎉 Check-in reward received: +${creditDiff.toLocaleString()} credits`);
            message += ` (+${creditDiff.toLocaleString()})`;
        } else if (creditDiff === 0) {
            console.log(`ℹ️ Already checked in today or no check-in reward`);
        } else {
            console.log(`⚠️ Credits decreased: ${creditDiff.toLocaleString()}`);
        }

        // Calculate percentage
        const totalCredit = finalCredit + usedCredit;
        const availablePercent = totalCredit > 0 ? ((finalCredit / totalCredit) * 100).toFixed(1) : 0;
        message += ` (${availablePercent}%)`;

        console.log(`✅ ${message}`);
    }

    async getCredits(teamId, authToken, headers) {
        const creditUrl = `https://api.1min.ai/teams/${teamId}/credits`;
        console.log(`🌐 Requesting credit URL: ${creditUrl}`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(creditUrl, { 
                headers,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log(`📊 Credit API status: ${response.status}`);

            if (response.status === 200) {
                const creditData = await response.json();
                return creditData.credit || 0;
            } else {
                console.log(`❌ Credit API failed - Status: ${response.status}`);
                return 0;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`⏰ Credit API request timeout`);
            } else {
                console.log(`❌ Credit API error: ${error.message}`);
            }
            return 0;
        }
    }

    async checkUnreadNotifications(authToken, headers) {
        const notificationUrl = 'https://api.1min.ai/notifications/unread';
        console.log(`🔔 Checking unread notifications: ${notificationUrl}`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(notificationUrl, { 
                headers,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log(`📊 Notification API status: ${response.status}`);

            if (response.status === 200) {
                const notificationData = await response.json();
                console.log(`📬 Unread notification count: ${notificationData.count || 0}`);
                const responseText = JSON.stringify(notificationData);
                console.log(`📄 Notification response: ${responseText.substring(0, 200)}`);
            } else {
                console.log(`❌ Notification API failed - Status: ${response.status}`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`⏰ Notification API request timeout`);
            } else {
                console.log(`❌ Notification API error: ${error.message}`);
            }
        }
    }

    calculatePercent(remainingCredit, usedCredit) {
        const total = remainingCredit + usedCredit;
        return total > 0 ? ((remainingCredit / total) * 100).toFixed(1) : 0;
    }

    async run() {
        try {
            console.log('🎬 1min.ai auto checkin started');
            console.log(`⏰ Execution time: ${new Date().toLocaleString()}`);
            
            await this.login();
            
            console.log('🎉 Checkin process completed');
            core.setOutput('success', 'true');
            core.setOutput('message', 'Checkin successful');
            return true;
        } catch (error) {
            console.error('💥 Checkin process failed:', error.message);
            core.setFailed(error.message);
            core.setOutput('success', 'false');
            core.setOutput('message', error.message);
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