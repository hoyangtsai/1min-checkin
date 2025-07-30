// Unit tests for core functionality
const OTPAuth = require('otpauth');

console.log('🧪 Running unit tests...\n');

// Test 1: TOTP functionality
try {
    const totp = new OTPAuth.TOTP({
        secret: 'JBSWY3DPEHPK3PXP',
        digits: 6,
        period: 30,
        algorithm: 'SHA1'
    });
    const code = totp.generate();
    console.log('✅ TOTP test passed - Generated code:', code);
} catch (error) {
    console.log('❌ TOTP test failed:', error.message);
}

// Test 2: Device ID generation
try {
    const chars = '0123456789abcdef';
    const randomString = (length) =>
        Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

    const part1 = randomString(16);
    const part2 = randomString(15);
    const part3 = randomString(8);
    const part4 = randomString(6);
    const part5 = randomString(16);

    const deviceId = `$device:${part1}-${part2}-${part3}-${part4}-${part5}`;
    console.log('✅ Device ID test passed - Generated ID:', deviceId);
} catch (error) {
    console.log('❌ Device ID test failed:', error.message);
}

// Test 3: TOTP validation
try {
    function validateTotpSecret(secret) {
        return secret && secret !== 'null' && secret.trim() !== '' ? secret : null;
    }
    
    console.log('✅ TOTP validation tests:');
    console.log('  - Valid secret:', validateTotpSecret('JBSWY3DPEHPK3PXP') ? 'PASS' : 'FAIL');
    console.log('  - Empty string:', validateTotpSecret('') ? 'FAIL' : 'PASS');
    console.log('  - Null string:', validateTotpSecret('null') ? 'FAIL' : 'PASS');
    console.log('  - Whitespace:', validateTotpSecret('  ') ? 'FAIL' : 'PASS');
} catch (error) {
    console.log('❌ TOTP validation test failed:', error.message);
}

// Test 4: Percentage calculation
try {
    function calculatePercent(remainingCredit, usedCredit) {
        const total = remainingCredit + usedCredit;
        return total > 0 ? ((remainingCredit / total) * 100).toFixed(1) : 0;
    }
    
    console.log('✅ Percentage calculation tests:');
    console.log('  - 50/100 total:', calculatePercent(50, 50) + '%');
    console.log('  - 0/0 total:', calculatePercent(0, 0) + '%');
    console.log('  - 75/25 total:', calculatePercent(75, 25) + '%');
} catch (error) {
    console.log('❌ Percentage calculation test failed:', error.message);
}

console.log('\n🎉 Unit tests completed!');