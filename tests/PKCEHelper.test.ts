import { describe, it, expect } from 'vitest';
import { PKCEHelper } from '../src/auth/PKCEHelper.js';

describe('PKCEHelper', () => {
  it('should generate a verifier of the correct length', () => {
    const length = 43;
    const verifier = PKCEHelper.generateVerifier(length);
    expect(verifier.length).toBe(length);
  });

  it('should generate a verifier with default length if not specified', () => {
    const verifier = PKCEHelper.generateVerifier();
    expect(verifier.length).toBe(128);
  });

  it('should generate a valid challenge', async () => {
    const verifier = 'test-verifier';
    const challenge = await PKCEHelper.generateChallenge(verifier);
    expect(typeof challenge).toBe('string');
    expect(challenge.length).toBeGreaterThan(0);
    // Base64URL encoded string should not contain +, /, or =
    expect(challenge).not.toMatch(/[+/=]/);
  });
});
