import { describe, expect, it } from 'vitest';
import { startupSignin } from '../src/app';

// Dry run and replay show data tiles and never tune the service, so the window must not hold
// the app back waiting for a sign-in (it waits up to signin.waitForUserMs, 10 minutes).
describe('sign-in at startup', () => {
  it('signs in at once only for live video', () => {
    expect(startupSignin('live', false)).toBe('now');
    expect(startupSignin('dry-run', false)).toBe('defer');
    expect(startupSignin('replay', false)).toBe('defer');
  });
  it('setup asks for the sign-in itself', () => {
    expect(startupSignin('live', true)).toBe('defer');
  });
});
