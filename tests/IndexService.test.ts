import { describe, expect, it } from 'vitest';
import { IndexService } from '../src/index/IndexService';
import { QuickMemoParser } from '../src/markdown/QuickMemoParser';
import { DAILY_NOTE_WITH_MEMOS } from '../src/test/fixtures';
import { FakeVault } from '../src/test/fakeVault';

describe('IndexService', () => {
  it('rebuilds records, tags, and heatmap from markdown files', async () => {
    const vault = new FakeVault({
      'Daily Notes/2026-06-18-quick-memos.md': DAILY_NOTE_WITH_MEMOS,
      'Daily Notes/2026-06-19-quick-memos.md': '## Quick Memo\n\n- 08:00 [记录] second day #project ^oqm-20260619-080000-abcd\n',
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

  it('only indexes -quick-memos files and ignores plain daily notes', async () => {
    const vault = new FakeVault({
      '每日工作/2026/06/2026-06-18-quick-memos.md': DAILY_NOTE_WITH_MEMOS,
      '每日工作/2026/06/2026-06-19.md': '## Quick Memo\n\n- 09:00 [记录] plain daily note ignored #plain ^oqm-20260619-090000-plain\n',
      'Projects/2026-06-20-quick-memos.md': '## Quick Memo\n\n- 09:00 [记录] project quick memo #project ^oqm-20260620-090000-project\n',
      'Projects/2026 planning.md': '## Quick Memo\n\n- 09:00 [记录] should not be indexed #noise ^oqm-20260618-090000-noise\n',
    });
    const index = new IndexService(vault, new QuickMemoParser('Quick Memo'));
    await index.rebuild();

    expect(index.query({ text: 'plain daily note ignored' })).toHaveLength(0);
    expect(index.query({ text: 'project quick memo' })).toHaveLength(1);
    expect(index.query({ text: 'should not be indexed' })).toHaveLength(0);
    expect(index.tags()).toContainEqual(['#project', 2]);
    expect(index.tags()).not.toContainEqual(['#plain', 1]);
    expect(index.tags()).not.toContainEqual(['#noise', 1]);
    expect(index.heatmap()).toEqual([
      { date: '2026-06-18', count: 4 },
      { date: '2026-06-20', count: 1 },
    ]);
  });

  it('exposes duplicate id conflicts via warnings() after rebuild', async () => {
    const dupId = 'oqm-20260618-090000-dup';
    const vault = new FakeVault({
      'Daily Notes/2026-06-18-quick-memos.md': `## Quick Memo\n\n- 09:00 [记录] first #a ^${dupId}\n- 09:30 [记录] second #b ^${dupId}\n`,
    });
    const index = new IndexService(vault, new QuickMemoParser('Quick Memo'));
    await index.rebuild();

    expect(index.warnings().length).toBeGreaterThanOrEqual(1);
    expect(index.warnings().some((warning) => warning.message.includes('Duplicate Quick Memo block id'))).toBe(true);
  });
});
