import { describe, expect, it } from 'vitest';
import { clientIp } from './rate-limit';

function headers(values: Record<string, string>): { get(name: string): string | null } {
  return { get: (name) => values[name] ?? null };
}

describe('clientIp', () => {
  it('uses the left-most entry of x-forwarded-for', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('trims whitespace around the left-most entry', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(clientIp(headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip when x-forwarded-for is empty', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '', 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('returns "unknown" when neither header is present', () => {
    expect(clientIp(headers({}))).toBe('unknown');
  });

  it('returns "unknown" when x-forwarded-for is only whitespace/commas', () => {
    expect(clientIp(headers({ 'x-forwarded-for': ' , ' }))).toBe('unknown');
  });
});
