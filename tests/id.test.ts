import { describe, expect, it, vi } from 'vitest';
import { contentHash, createBlockId, extractBlockId, randomIdSuffix, stripBlockId } from '../src/markdown/id';

describe('id helpers', () => {
  it('creates deterministic block ids from date, time, and suffix', () => {
    expect(createBlockId('2026-06-18', '09:12', 'a1b2')).toBe('oqm-20260618-091200-a1b2');
  });

  it('extracts and strips quick memo block ids', () => {
    const line = '- 09:12 [闪念] idea #tag ^oqm-20260618-091200-a1b2';
    expect(extractBlockId(line)).toBe('oqm-20260618-091200-a1b2');
    expect(stripBlockId(line)).toBe('- 09:12 [闪念] idea #tag');
  });

  it('ignores non quick memo block ids', () => {
    expect(extractBlockId('- text ^not-ours')).toBeUndefined();
  });

  it('hashes equivalent whitespace consistently', () => {
    expect(contentHash(' hello\nworld ')).toBe(contentHash('hello world'));
  });

  it('produces a 6-char lowercase alphanumeric suffix from randomIdSuffix', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    expect(randomIdSuffix()).toBe('4fzzzx');
    vi.restoreAllMocks();
  });
});
