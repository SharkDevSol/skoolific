const { gregorianToEthiopian, ethiopianToGregorian, getEthiopianDate } = require('./utils/ethiopianCalendar');

console.log('=== Test: Oct 10, 2025 = Meskerem 30, 2018 ===');
const r1 = gregorianToEthiopian(new Date(2025, 9, 10)); // Oct 10, 2025 (month 9 = Oct)
console.log(`Result: ${r1.day}/${r1.month}/${r1.year} (${r1.monthNameEn})`);
console.log(`Expected: 30/1/2018 (Meskerem)`);
console.log(r1.year === 2018 && r1.month === 1 && r1.day === 30 ? '✓ PASS' : '✗ FAIL');

console.log('\n=== Test: Aug 6, 2026 = Hamle 30, 2018 ===');
const r2 = gregorianToEthiopian(new Date(2026, 7, 6)); // Aug 6, 2026
console.log(`Result: ${r2.day}/${r2.month}/${r2.year} (${r2.monthNameEn})`);
console.log(`Expected: 30/11/2018 (Hamle)`);
console.log(r2.year === 2018 && r2.month === 11 && r2.day === 30 ? '✓ PASS' : '✗ FAIL');

console.log('\n=== Test: Current Ethiopian date ===');
const now = getEthiopianDate();
console.log(`Now: ${now.day}/${now.month}/${now.year} (${now.monthNameEn})`);
console.log(now.year && now.month && now.monthNameEn ? '✓ PASS' : '✗ FAIL');

console.log('\n=== Test: ethiopianToGregorian round-trip ===');
const r3 = ethiopianToGregorian(2018, 1, 30);
console.log(`Meskerem 30, 2018 → ${r3.toISOString()}`);
const roundTrip = gregorianToEthiopian(r3);
console.log(`Round-trip: ${roundTrip.day}/${roundTrip.month}/${roundTrip.year} (${roundTrip.monthNameEn})`);
console.log(roundTrip.year === 2018 && roundTrip.month === 1 && roundTrip.day === 30 ? '✓ PASS' : '✗ FAIL');
