import { describe, expect, it } from 'vitest';
import { IndexService } from '../src/index/IndexService';
import { QuickMemoParser } from '../src/markdown/QuickMemoParser';
import { DAILY_NOTE_WITH_MEMOS } from '../src/test/fixtures';
import { FakeVault } from '../src/test/fakeVault';

describe('IndexService', () => {
  it('rebuilds records, tags, and heatmap from markdown files', async () => {
    const vault = new FakeVault({
      'Daily Notes/2026-06-18.md': DAILY_NOTE_WITH_MEMOS,
      'Daily Notes/2026-06-19.md': '## Quick Memo\n\n- 08:00 [记录] second day #project ^oqm-20260619-080000-abcd\n',
    });
    const index = new IndexService(vault, new QuickMemoParser('Quick Memo'));
    await index.rebuild();

    expect(index.query({ tags: ['#project'] }).map((record) => record.date)).toEqual(['2026-06-18', '2026-06-19']);
    expect(index.query({ types: ['flash'] })).toHaveLength(1);
    expect(index.query({ text: '布局' })).toHaveLength(1);
    expect(index.heatmap()).toEqual([
      { date: '2026-06-18', count: 4 },
      { date: '2026-06-19', count: 1 },
    ]);
    expect(index.tags()).toEqual([
      ['#project', 2],
      ['#done', 1],
      ['#obsidian', 1],
      ['#todo', 1],
    ]);
  });

  it('exposes duplicate id conflicts via warnings() after rebuild', async () => {
    const dupId = 'oqm-20260618-090000-dup';
    const vault = new FakeVault({
      'Daily Notes/2026-06-18.md': `## Quick Memo\n\n- 09:00 [记录] first #a ^${dupId}\n- 09:30 [记录] second #b ^${dupId}\n`,
    });
    const index = new IndexService(vault, new QuickMemoParser('Quick Memo'));
    await index.rebuild();

    expect(index.warnings().length).toBeGreaterThanOrEqual(1);
    expect(index.warnings().some((warning) => warning.message.includes('Duplicate Quick Memo block id'))).toBe(true);
  });
});
