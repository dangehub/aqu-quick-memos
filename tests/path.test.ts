import { describe, expect, it } from 'vitest';
import { dateFromPath, isQuickMemoPath, QUICK_MEMO_FILENAME_SUFFIX } from '../src/daily-notes/path';

describe('dateFromPath', () => {
  it('parses the plugin\'s own -quick-memos files (nested folders)', () => {
    expect(dateFromPath(`每日工作/2026/06/2026-06-19${QUICK_MEMO_FILENAME_SUFFIX}.md`)).toBe('2026-06-19');
  });

  it('parses flat -quick-memos files', () => {
    expect(dateFromPath(`Daily Notes/2026-06-18${QUICK_MEMO_FILENAME_SUFFIX}.md`)).toBe('2026-06-18');
  });

  it('ignores plain yyyy-MM-dd.md daily notes', () => {
    expect(dateFromPath('每日工作/2026/06/2026-06-19.md')).toBe('1970-01-01');
    expect(dateFromPath('Daily Notes/2026-06-18.md')).toBe('1970-01-01');
    expect(isQuickMemoPath('每日工作/2026/06/2026-06-19.md')).toBe(false);
  });

  it('returns a sentinel for non-quick-memo files', () => {
    expect(dateFromPath('Notes/random.md')).toBe('1970-01-01');
    expect(isQuickMemoPath(`Daily Notes/2026-06-18${QUICK_MEMO_FILENAME_SUFFIX}.md`)).toBe(true);
  });
});
