import { describe, expect, it } from 'vitest';
import { DailyNoteResolver } from '../src/daily-notes/DailyNoteResolver';
import { MarkdownRecordRepository } from '../src/markdown/MarkdownRecordRepository';
import { QuickMemoParser } from '../src/markdown/QuickMemoParser';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import { FakeVault } from '../src/test/fakeVault';

describe('MarkdownRecordRepository', () => {
  it('appends records to the Quick Memo section', async () => {
    const vault = new FakeVault({ 'Daily Notes/2026-06-18.md': '# Day\n\n## Quick Memo\n' });
    const repo = makeRepo(vault);
    await repo.appendRecord({ date: '2026-06-18', time: '09:12', type: 'flash', content: 'idea #tag', body: 'line 2' }, 'a1b2');
    expect(await vault.read('Daily Notes/2026-06-18.md')).toContain('- 09:12 [闪念] idea #tag ^oqm-20260618-091200-a1b2\n  line 2');
  });

  it('respects pure markdown mode when block ids are disabled', async () => {
    const vault = new FakeVault();
    const settings = { ...DEFAULT_SETTINGS, enableBlockIds: false };
    const repo = makeRepo(vault, settings);
    await repo.appendRecord({ date: '2026-06-18', time: '10:00', type: 'record', content: 'plain' }, 'a1b2');
    expect(await vault.read('Daily Notes/2026-06-18.md')).toContain('- 10:00 [记录] plain');
    expect(await vault.read('Daily Notes/2026-06-18.md')).not.toContain('^oqm-');
  });

  it('toggles todo completion by stable id', async () => {
    const vault = new FakeVault({ 'Daily Notes/2026-06-18.md': '## Quick Memo\n\n- [ ] 10:20 [待办] task #todo ^oqm-20260618-102000-e5f6\n' });
    const repo = makeRepo(vault);
    await repo.toggleTodo('oqm-20260618-102000-e5f6');
    expect(await vault.read('Daily Notes/2026-06-18.md')).toContain('- [x] 10:20 [待办] task #todo ^oqm-20260618-102000-e5f6');
  });

  it('updates record content and preserves time and id', async () => {
    const vault = new FakeVault({ 'Daily Notes/2026-06-18.md': '## Quick Memo\n\n- 09:12 [闪念] old ^oqm-20260618-091200-a1b2\n' });
    const repo = makeRepo(vault);
    await repo.updateRecord('oqm-20260618-091200-a1b2', { type: 'record', content: 'new #tag', body: 'body' });
    expect(await vault.read('Daily Notes/2026-06-18.md')).toContain('- 09:12 [记录] new #tag ^oqm-20260618-091200-a1b2\n  body');
  });

  it('deletes a record and its indented body', async () => {
    const vault = new FakeVault({ 'Daily Notes/2026-06-18.md': '## Quick Memo\n\n- 09:12 [闪念] remove ^oqm-20260618-091200-a1b2\n  body\n- 10:00 [记录] keep ^oqm-20260618-100000-b2\n' });
    const repo = makeRepo(vault);
    await repo.deleteRecord('oqm-20260618-091200-a1b2');
    const content = await vault.read('Daily Notes/2026-06-18.md');
    expect(content).not.toContain('remove');
    expect(content).toContain('keep');
  });

  it('returns the last appended record in pure-markdown mode', async () => {
    const vault = new FakeVault({ 'Daily Notes/2026-06-18.md': '## Quick Memo\n\n- 08:00 [记录] earlier note\n' });
    const settings = { ...DEFAULT_SETTINGS, enableBlockIds: false };
    const repo = makeRepo(vault, settings);
    const returned = await repo.appendRecord({ date: '2026-06-18', time: '11:30', type: 'record', content: 'appended later' }, 'a1b2');
    expect(returned.content).toBe('appended later');
    expect(returned.time).toBe('11:30');
    expect(returned.id).toBeUndefined();
  });

  it('backfills missing ids and leaves already-id records unchanged', async () => {
    const vault = new FakeVault({
      'Daily Notes/2026-06-18.md': '## Quick Memo\n\n- 09:00 [闪念] needs id\n- 10:00 [记录] has id ^oqm-20260618-100000-z9\n',
    });
    const repo = makeRepo(vault);
    const count = await repo.backfillMissingIds('2026-06-18');
    expect(count).toBe(1);
    const content = await vault.read('Daily Notes/2026-06-18.md');
    expect(content).toContain('- 09:00 [闪念] needs id ^oqm-');
    expect(content).toContain('- 10:00 [记录] has id ^oqm-20260618-100000-z9');
  });

  it('deletes a record while preserving a following section', async () => {
    const vault = new FakeVault({
      'Daily Notes/2026-06-18.md': '## Quick Memo\n\n- 09:00 [闪念] remove ^oqm-20260618-090000-x1\n\n## Other Section\n\nsome notes\n',
    });
    const repo = makeRepo(vault);
    await repo.deleteRecord('oqm-20260618-090000-x1');
    const content = await vault.read('Daily Notes/2026-06-18.md');
    expect(content).not.toContain('remove');
    expect(content).toContain('## Other Section');
    expect(content).toContain('some notes');
  });
});

function makeRepo(vault: FakeVault, settings = DEFAULT_SETTINGS): MarkdownRecordRepository {
  const resolver = new DailyNoteResolver(vault, undefined, settings);
  return new MarkdownRecordRepository(vault, resolver, new QuickMemoParser(settings.quickMemoHeading), settings);
}
