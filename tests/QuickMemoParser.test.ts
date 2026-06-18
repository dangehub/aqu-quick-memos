import { describe, expect, it } from 'vitest';
import { DAILY_NOTE_WITH_MEMOS, DAILY_NOTE_WITHOUT_MEMOS } from '../src/test/fixtures';
import { QuickMemoParser } from '../src/markdown/QuickMemoParser';

describe('QuickMemoParser', () => {
  const parser = new QuickMemoParser('Quick Memo');

  it('parses records only inside the Quick Memo section', () => {
    const result = parser.parseFile('Daily Notes/2026-06-18.md', '2026-06-18', DAILY_NOTE_WITH_MEMOS);
    expect(result.warnings).toEqual([]);
    expect(result.records).toHaveLength(4);
    expect(result.records.map((record) => record.type)).toEqual(['flash', 'record', 'todo', 'todo']);
    expect(result.records[0]).toMatchObject({
      id: 'oqm-20260618-091200-a1b2',
      date: '2026-06-18',
      time: '09:12',
      type: 'flash',
      content: '插件总览页布局可以做成三栏 #obsidian',
      body: '中间是输入区和记录流。\n右侧是热力图。',
      tags: ['#obsidian'],
      filePath: 'Daily Notes/2026-06-18.md',
      lineStart: 7,
      lineEnd: 9,
      hasStableId: true,
    });
    expect(result.records[2].completed).toBe(false);
    expect(result.records[3].completed).toBe(true);
  });

  it('returns no records when the section is missing', () => {
    expect(parser.parseFile('Daily Notes/2026-06-19.md', '2026-06-19', DAILY_NOTE_WITHOUT_MEMOS)).toEqual({ records: [], warnings: [] });
  });

  it('parses pure markdown records without ids', () => {
    const markdown = '## Quick Memo\n\n- 08:00 [记录] clean line #plain\n';
    const result = parser.parseFile('Daily Notes/2026-06-20.md', '2026-06-20', markdown);
    expect(result.records[0]).toMatchObject({
      id: undefined,
      hasStableId: false,
      content: 'clean line #plain',
      tags: ['#plain'],
    });
  });

  it('serializes drafts into list item markdown with optional block id', () => {
    expect(parser.serializeRecord({ date: '2026-06-18', time: '09:12', type: 'flash', content: 'hello #tag', body: 'line 2' }, 'oqm-20260618-091200-a1b2')).toBe('- 09:12 [闪念] hello #tag ^oqm-20260618-091200-a1b2\n  line 2');
    expect(parser.serializeRecord({ date: '2026-06-18', time: '10:20', type: 'todo', content: 'task', completed: false }, undefined)).toBe('- [ ] 10:20 [待办] task');
    expect(parser.serializeRecord({ date: '2026-06-18', time: '10:20', type: 'todo', content: 'task', completed: true }, 'oqm-20260618-102000-e5f6')).toBe('- [x] 10:20 [待办] task ^oqm-20260618-102000-e5f6');
  });
});
