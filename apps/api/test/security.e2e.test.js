/**
 * Security primitives — password strength + TOTP round-trip.
 * (The full HTTP MFA enroll→verify→login flow is not yet E2E-tested; this
 * locks the security-critical building blocks the routes rely on.)
 */
import { describe, it, expect } from 'vitest'
import { authenticator } from 'otplib'
import { validatePasswordStrength } from '../src/middleware/password-validator.js'

describe('Password strength validator', () => {
  it('accepts a strong password', () => {
    expect(validatePasswordStrength('Str0ng!Pass9').valid).toBe(true)
  })

  it.each([
    ['', 'required/short'],
    ['Short1!', 'too short'],
    ['alllowercase1!', 'no uppercase'],
    ['ALLUPPERCASE1!', 'no lowercase'],
    ['NoNumbersHere!', 'no digit'],
    ['NoSpecial123A', 'no special char'],
    ['Password123!', 'common pattern'],
    ['Plerous123!', 'brand pattern'],
  ])('rejects %s (%s)', (pw) => {
    expect(validatePasswordStrength(pw).valid).toBe(false)
  })
})

describe('TOTP (otplib) round-trip', () => {
  it('a token from the secret verifies; a wrong token does not', () => {
    const secret = authenticator.generateSecret()
    const token = authenticator.generate(secret)
    expect(authenticator.verify({ token, secret })).toBe(true)
    expect(authenticator.verify({ token: '000000', secret })).toBe(false)
  })
})
