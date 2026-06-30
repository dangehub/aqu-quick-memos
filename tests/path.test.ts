import { describe, expect, it } from 'vitest';
import { dateFromPath, isQuickMemoPath } from '../src/daily-notes/path';

describe('dateFromPath', () => {
  it('parses dates from diary files (flat)', () => {
    expect(dateFromPath('2026-06-19.md')).toBe('2026-06-19');
    expect(isQuickMemoPath('2026-06-19.md')).toBe(true);
  });

  it('parses dates from nested diary files', () => {
    expect(dateFromPath('每日工作/2026/06/2026-06-19.md')).toBe('2026-06-19');
    expect(isQuickMemoPath('每日工作/2026/06/2026-06-19.md')).toBe(true);
  });

  it('returns sentinel for non-diary files', () => {
    expect(dateFromPath('Notes/random.md')).toBe('1970-01-01');
    expect(isQuickMemoPath('Notes/random.md')).toBe(false);
  });

  it('handles hyphen and slash date separators', () => {
    expect(dateFromPath('2026/06/19-quick-memos.md')).toBe('1970-01-01');
  });
});
