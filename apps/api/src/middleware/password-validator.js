/**
 * Password Strength Validator
 *
 * Enforces OWASP-aligned password requirements:
 *  - Min 10 characters
 *  - At least 1 uppercase letter
 *  - At least 1 lowercase letter
 *  - At least 1 digit
 *  - At least 1 special character
 *  - No common patterns (password, 123456, qwerty, etc.)
 */

const COMMON_PATTERNS = [
  /^password/i,
  /^123456/,
  /^qwerty/i,
  /^abc123/i,
  /^letmein/i,
  /^welcome/i,
  /^admin/i,
  /^plerous/i,
]

/**
 * Validates password strength.
 * Returns { valid: true } or { valid: false, reason: string }
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, reason: 'Password is required' }
  }

  if (password.length < 10) {
    return { valid: false, reason: 'Password must be at least 10 characters' }
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter' }
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one lowercase letter' }
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number' }
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one special character' }
  }

  for (const pattern of COMMON_PATTERNS) {
    if (pattern.test(password)) {
      return { valid: false, reason: 'Password is too common or predictable' }
    }
  }

  return { valid: true }
}
