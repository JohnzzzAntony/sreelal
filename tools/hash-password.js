'use strict';

/**
 * Generates the bcrypt hash for ADMIN_PASSWORD_HASH.
 *
 *   npm run hash -- "your password here"
 *
 * Quote the password so the shell does not split or expand it.
 */

const bcrypt = require('bcryptjs');

const password = process.argv.slice(2).join(' ');

if (!password) {
  console.error('Usage: npm run hash -- "your password here"');
  process.exit(1);
}

if (password.length < 12) {
  console.error('Use at least 12 characters.');
  process.exit(1);
}

console.log('\nAdd this to your .env file:\n');
console.log('ADMIN_PASSWORD_HASH=' + bcrypt.hashSync(password, 12) + '\n');
