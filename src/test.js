// Test script - for local development testing
const OneMinAutoCheckin = require('./index.js');

// Mock environment variables (for testing only)
if (!process.env.EMAIL) {
    console.log('⚠️  Please set environment variables for testing:');
    console.log('export EMAIL="your-email@example.com"');
    console.log('export PASSWORD="your-password"');
    console.log('export TOTP_SECRET="your-totp-secret"  # Optional');
    console.log('');
    console.log('Then run: npm start');
    process.exit(1);
}

async function test() {
    try {
        console.log('🧪 Starting 1min.ai auto checkin test...');
        
        const checkin = new OneMinAutoCheckin();
        await checkin.run();
        
        console.log('✅ Test completed');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    test();
}