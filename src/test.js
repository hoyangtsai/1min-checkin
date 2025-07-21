// 測試腳本 - 用於本地開發測試
const OneMinAutoCheckin = require('./index.js');

// 模擬環境變數（僅用於測試）
if (!process.env.EMAIL) {
    console.log('⚠️  請設定環境變數進行測試:');
    console.log('export EMAIL="your-email@example.com"');
    console.log('export PASSWORD="your-password"');
    console.log('export TOTP_SECRET="your-totp-secret"  # 可選');
    console.log('');
    console.log('然後執行: npm start');
    process.exit(1);
}

async function test() {
    try {
        console.log('🧪 開始測試 1min.ai 自動簽到...');
        
        const checkin = new OneMinAutoCheckin();
        await checkin.run();
        
        console.log('✅ 測試完成');
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    test();
}