import { describe, expect, it } from 'vitest';
import { shouldHandleVaultFileEvent } from '../src/vaultEvents';

describe('shouldHandleVaultFileEvent', () => {
  it('handles diary-format markdown files and ignores non-diary files', () => {
    // Diary files (with date pattern) are handled
    expect(shouldHandleVaultFileEvent('2026-06-21.md')).toBe(true);
    expect(shouldHandleVaultFileEvent('每日工作/2026/06/2026-06-21.md')).toBe(true);
    expect(shouldHandleVaultFileEvent('Projects/2026-06-21.md')).toBe(true);
    // Non-diary files are ignored
    expect(shouldHandleVaultFileEvent('.obsidian/plugins/obsidian-linter/data.json')).toBe(false);
    expect(shouldHandleVaultFileEvent('Notes/random.md')).toBe(false);
    expect(shouldHandleVaultFileEvent('2026 planning.md')).toBe(false);
  });
});
