/**
 * Password Hashing Utilities
 * Uses bcryptjs (pure JS) for secure password hashing
 * Compatible with Docker containers without native compilation
 */

import bcrypt from 'bcryptjs';

// bcrypt cost factor (12 is recommended for production)
const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param {string} hash - Stored password hash
 * @param {string} password - Plain text password to verify
 * @returns {Promise<boolean>} - True if password matches
 */
export async function verifyPassword(hash, password) {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Check if a password meets security requirements
 * @param {string} password - Password to validate
 * @returns {{ valid: boolean, message?: string }}
 */
export function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: '密碼至少需要 8 個字元' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: '密碼需要包含至少一個數字' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: '密碼需要包含至少一個英文字母' };
  }
  return { valid: true };
}

export default {
  hashPassword,
  verifyPassword,
  validatePassword,
};
