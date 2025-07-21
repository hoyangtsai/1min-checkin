const core = require('@actions/core');
const { OTPAuth } = require('otpauth');
const fetch = require('node-fetch');

class OneMinAutoCheckin {
    constructor() {
        // 優先使用 GitHub Action inputs，其次使用環境變數
        this.email = core.getInput('email') || process.env.EMAIL;
        this.password = core.getInput('password') || process.env.PASSWORD;
        this.totpSecret = core.getInput('totp_secret') || process.env.TOTP_SECRET;
        this.deviceId = this.generateDeviceId();
        
        if (!this.email || !this.password) {
            const error = '缺少必要的參數: email 和 password';
            core.setFailed(error);
            throw new Error(error);
        }
        
        console.log(`📧 帳號: ${this.email.substring(0, 3)}***${this.email.substring(this.email.indexOf('@'))}`);
        console.log(`🔐 TOTP: ${this.totpSecret ? '已設定' : '未設定'}`);
    }

    generateDeviceId() {
        const chars = '0123456789abcdef';
        const randomString = (length) =>
            Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

        const part1 = randomString(16);
        const part2 = randomString(15);
        return `$device:${part1}-${part2}-17525636-16a7f0-${part1}`;
    }

    async login() {
        console.log('🚀 開始登入請求...');
        
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
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers,
                body
            });

            const data = await response.json();
            console.log(`📊 登入回應狀態: ${response.status}`);

            if (response.status === 200 && data.user) {
                if (data.user.mfaRequired) {
                    console.log('🔐 需要 TOTP 驗證');
                    if (this.totpSecret) {
                        return await this.performMFAVerification(data.user.token);
                    } else {
                        throw new Error('需要 TOTP 但未提供金鑰');
                    }
                } else {
                    console.log('✅ 登入成功（無需 TOTP）');
                    await this.displayCreditInfo(data);
                    return data;
                }
            } else {
                let errorMsg = '登入失敗';
                if (data.message) {
                    errorMsg = data.message;
                } else if (response.status === 401) {
                    errorMsg = '帳號或密碼錯誤';
                } else if (response.status === 429) {
                    errorMsg = '請求過於頻繁，請稍後再試';
                }
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('❌ 登入失敗:', error.message);
            throw error;
        }
    }

    async performMFAVerification(tempToken) {
        console.log('🔐 開始 TOTP 驗證流程...');

        const totp = new OTPAuth.TOTP({
            secret: this.totpSecret,
            digits: 6,
            period: 30,
            algorithm: 'SHA1'
        });

        const totpCode = totp.generate();
        console.log('🎯 產生 TOTP 驗證碼');

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
            const response = await fetch(mfaUrl, {
                method: 'POST',
                headers,
                body
            });

            const data = await response.json();
            console.log(`📊 TOTP 驗證回應狀態: ${response.status}`);

            if (response.status === 200) {
                console.log('✅ TOTP 驗證成功！');
                await this.displayCreditInfo(data);
                return data;
            } else {
                const errorMsg = data.message || `HTTP ${response.status}`;
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('❌ TOTP 驗證失敗:', error.message);
            throw error;
        }
    }

    async displayCreditInfo(responseData) {
        try {
            const user = responseData.user;
            if (user && user.teams && user.teams.length > 0) {
                const teamInfo = user.teams[0];
                const teamId = teamInfo.teamId || teamInfo.team.uuid;
                const authToken = responseData.token || responseData.user.token;

                const userName = (user.teams && user.teams[0] && user.teams[0].userName) ?
                    user.teams[0].userName :
                    (user.email ? user.email.split('@')[0] : '用戶');

                if (teamId && authToken) {
                    const usedCredit = teamInfo.usedCredit || 0;
                    await this.fetchLatestCredit(teamId, authToken, userName, usedCredit);
                } else {
                    const remainingCredit = teamInfo.team.credit || 0;
                    const usedCredit = teamInfo.usedCredit || 0;
                    const totalCredit = remainingCredit + usedCredit;
                    const availablePercent = totalCredit > 0 ? ((remainingCredit / totalCredit) * 100).toFixed(1) : 0;

                    console.log('💰 Credit 資訊:');
                    console.log(`   可用額度: ${remainingCredit.toLocaleString('zh-TW')}`);
                    console.log(`   已使用: ${usedCredit.toLocaleString('zh-TW')}`);
                    console.log(`   可用比例: ${availablePercent}%`);
                    console.log(`✅ ${userName} 登入成功 | 餘額: ${remainingCredit.toLocaleString('zh-TW')} (${availablePercent}%)`);
                }
            } else {
                console.log('⚠️ 無法取得 Credit 資訊');
                console.log('✅ 登入成功！');
            }
        } catch (error) {
            console.error('❌ 顯示 Credit 資訊時發生錯誤:', error.message);
            console.log('✅ 登入成功！');
        }
    }

    async fetchLatestCredit(teamId, authToken, userName, usedCredit) {
        console.log(`🔄 獲取最新 Credit 資訊 (Team ID: ${teamId})`);

        const creditUrl = `https://api.1min.ai/teams/${teamId}/credits`;
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

        try {
            const response = await fetch(creditUrl, { headers });
            console.log(`📊 Credit API 回應狀態: ${response.status}`);

            if (response.status === 200) {
                const creditData = await response.json();
                const latestCredit = creditData.credit || 0;
                const totalCredit = latestCredit + usedCredit;
                const availablePercent = totalCredit > 0 ? ((latestCredit / totalCredit) * 100).toFixed(1) : 0;

                console.log('💰 最新 Credit 資訊:');
                console.log(`   可用額度: ${latestCredit.toLocaleString('zh-TW')}`);
                console.log(`   已使用: ${usedCredit.toLocaleString('zh-TW')}`);
                console.log(`   可用比例: ${availablePercent}%`);
                console.log(`✅ ${userName} 登入成功 | 餘額: ${latestCredit.toLocaleString('zh-TW')} (${availablePercent}%)`);
            } else {
                console.log(`❌ 獲取 Credit 失敗 - 狀態: ${response.status}`);
                console.log(`✅ ${userName} 登入成功`);
            }
        } catch (error) {
            console.error('❌ 獲取 Credit 資訊失敗:', error.message);
            console.log(`✅ ${userName} 登入成功`);
        }
    }

    async run() {
        try {
            console.log('🎬 1min.ai 自動簽到開始');
            console.log(`⏰ 執行時間: ${new Date().toLocaleString('zh-TW')}`);
            
            await this.login();
            
            console.log('🎉 簽到流程完成');
            core.setOutput('success', 'true');
            core.setOutput('message', '簽到成功');
            return true;
        } catch (error) {
            console.error('💥 簽到流程失敗:', error.message);
            core.setFailed(error.message);
            core.setOutput('success', 'false');
            core.setOutput('message', error.message);
            process.exit(1);
        }
    }
}

// 執行簽到
if (require.main === module) {
    const checkin = new OneMinAutoCheckin();
    checkin.run();
}

module.exports = OneMinAutoCheckin;