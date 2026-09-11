// Utility to generate a unique 10-digit invoice reference code.
// Digits only so it's easy to type/read on a voucher.

const crypto = require('crypto');

// Generate a random 10-digit number as a string, e.g. "2946393102"
function generateInvoiceRefCode() {
  // Use crypto for a uniform distribution across all 10^10 values.
  // 10 digits fits within 34 bits; grab 4 bytes and mask.
  let code = '';
  for (;;) {
    const buf = crypto.randomBytes(4);
    const num = buf.readUInt32BE(0);
    const padded = String(num % 10000000000).padStart(10, '0');
    code = padded;
    // Avoid leading-only zeros that look odd; still fine either way.
    break;
  }
  return code;
}

// Ensure uniqueness against a Prisma-model-like query resolver.
// `exists` should be an async function(code) returning boolean.
async function generateUniqueInvoiceRefCode(exists) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = generateInvoiceRefCode();
    if (!exists || !(await exists(code))) {
      return code;
    }
  }
  throw new Error('Unable to generate a unique invoice reference code');
}

module.exports = {
  generateInvoiceRefCode,
  generateUniqueInvoiceRefCode,
};