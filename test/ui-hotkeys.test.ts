import { describe, expect, it } from 'vitest';
import { typingIn } from '../src/ui/util';

const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as EventTarget;

describe('window hotkeys', () => {
  it('stay out of text being typed: inputs, the diagnostics JSON editor, selects', () => {
    expect(typingIn(el('INPUT'))).toBe(true);
    expect(typingIn(el('TEXTAREA'))).toBe(true); // "tuning": 1500 typed there must not toggle the ticker or fullscreen screen 1
    expect(typingIn(el('SELECT'))).toBe(true);
    expect(typingIn(el('DIV', true))).toBe(true);
    expect(typingIn(el('BUTTON'))).toBe(false);
    expect(typingIn(el('BODY'))).toBe(false);
    expect(typingIn(null)).toBe(false);
  });
});
