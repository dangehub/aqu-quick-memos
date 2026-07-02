import { describe, expect, it } from 'vitest';
import { FakeVault } from '../src/test/fakeVault';
import type { QuickMemoRecord } from '../src/types';
import { QuickMemoParser } from '../src/markdown/QuickMemoParser';
import { MarkdownRecordRepository } from '../src/markdown/MarkdownRecordRepository';
import { DailyNoteResolver } from '../src/daily-notes/DailyNoteResolver';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import { dateFromPath, isQuickMemoPath } from '../src/daily-notes/path';

function makeRepo(vault: FakeVault, settings = { ...DEFAULT_SETTINGS, quickMemoHeading: '## Quick Memo' }) {
  const parser = new QuickMemoParser(settings.quickMemoHeading);
  const resolver = new DailyNoteResolver(vault, undefined, settings);
  return new MarkdownRecordRepository(vault, resolver, parser, settings);
}

describe('MarkdownRecordRepository', () => {
  it('appends records to the Quick Memo section', async () => {
    const vault = new FakeVault({ '2026-06-18.md': '# Day\n\n## Quick Memo\n' });
    const repo = makeRepo(vault);
    await repo.appendRecord({ date: '2026-06-18', time: '09:12', type: 'memo', content: 'idea #tag', body: 'line 2' }, 'a1b2');
    expect(await vault.read('2026-06-18.md')).toContain('- 09:12\n  idea #tag\n  line 2 ^omm-20260618-091200-a1b2');
  });

  it('creates a missing Quick Memo section', async () => {
    const vault = new FakeVault({ '2026-06-18.md': '# Day\n' });
    const repo = makeRepo(vault);
    await repo.appendRecord({ date: '2026-06-18', time: '10:00', type: 'memo', content: 'plain' }, 'a1b2');
    expect(await vault.read('2026-06-18.md')).toContain('## Quick Memo');
    expect(await vault.read('2026-06-18.md')).toContain('- 10:00 plain ^omm-20260618-100000-a1b2');
  });

  it('reads records for a date', async () => {
    const vault = new FakeVault({
      '2026-06-18.md': '# Day\n\n## Quick Memo\n\n- 09:12 idea #a ^omm-20260618-091200-a1b2\n- [ ] 10:20 task ^omm-20260618-102000-c3d4\n',
    });
    const repo = makeRepo(vault);
    const records = await repo.readRecords('2026-06-18');
    expect(records).toHaveLength(2);
    expect(records[0].type).toBe('memo');
    expect(records[1].type).toBe('todo');
  });

  it('updates a record', async () => {
    const vault = new FakeVault({
      '2026-06-18.md': '# Day\n\n## Quick Memo\n\n- 09:12 old content ^omm-20260618-091200-a1b2\n',
    });
    const repo = makeRepo(vault);
    await repo.updateRecord('omm-20260618-091200-a1b2', { type: 'memo', content: 'new #tag', body: 'body' });
    const content = await vault.read('2026-06-18.md');
    expect(content).toContain('- 09:12\n  new #tag\n  body ^omm-20260618-091200-a1b2');
  });

  it('toggles a todo', async () => {
    const vault = new FakeVault({
      '2026-06-18.md': '# Day\n\n## Quick Memo\n\n- [ ] 10:20 task ^omm-20260618-102000-c3d4\n',
    });
    const repo = makeRepo(vault);
    await repo.toggleTodo('omm-20260618-102000-c3d4');
    expect(await vault.read('2026-06-18.md')).toContain('- [x] 10:20 task ^omm-20260618-102000-c3d4');
  });

  it('deletes a record', async () => {
    const vault = new FakeVault({
      '2026-06-18.md': '# Day\n\n## Quick Memo\n\n- 09:12 idea ^omm-20260618-091200-a1b2\n- [ ] 10:20 task ^omm-20260618-102000-c3d4\n',
    });
    const repo = makeRepo(vault);
    await repo.deleteRecord('omm-20260618-091200-a1b2');
    expect(await vault.read('2026-06-18.md')).not.toContain('omm-20260618-091200-a1b2');
    expect(await vault.read('2026-06-18.md')).toContain('omm-20260618-102000-c3d4');
  });

  it('returns the appended record', async () => {
    const vault = new FakeVault({ '2026-06-18.md': '# Day\n\n## Quick Memo\n' });
    const repo = makeRepo(vault);
    const returned = await repo.appendRecord({ date: '2026-06-18', time: '11:30', type: 'memo', content: 'appended later' }, 'a1b2');
    expect(returned.type).toBe('memo');
    expect(returned.content).toBe('appended later');
    expect(returned.time).toBe('11:30');
  });

  it('ignores non-quick-memo markdown files', () => {
    expect(isQuickMemoPath('Notes/random.md')).toBe(false);
  });

  it('detects quick memo diary paths', () => {
    expect(isQuickMemoPath('2026-06-18.md')).toBe(true);
  });
});
