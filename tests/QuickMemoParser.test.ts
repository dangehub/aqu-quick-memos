import { describe, expect, it } from 'vitest';
import { DAILY_NOTE_WITH_MEMOS, DAILY_NOTE_WITHOUT_MEMOS } from '../src/test/fixtures';
import { QuickMemoParser } from '../src/markdown/QuickMemoParser';

describe('QuickMemoParser', () => {
  const parser = new QuickMemoParser('Quick Memo');
  it('parses records only inside the Quick Memo section', () => {
    const result = parser.parseFile('Daily Notes/2026-06-18.md', '2026-06-18', DAILY_NOTE_WITH_MEMOS);
    expect(result.warnings).toEqual([]);
    expect(result.records).toHaveLength(4);
    expect(result.records.map((record) => record.type)).toEqual(['memo', 'memo', 'todo', 'todo']);
    expect(result.records[0]).toMatchObject({
      id: 'omm-20260618-091200-a1b2',
      date: '2026-06-18',
      time: '09:12',
      type: 'memo',
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
    const markdown = '## Quick Memo\n\n- 08:00 clean line #plain\n';
    const result = parser.parseFile('Daily Notes/2026-06-20.md', '2026-06-20', markdown);
    expect(result.records[0]).toMatchObject({
      id: undefined,
      hasStableId: false,
      content: 'clean line #plain',
      tags: ['#plain'],
    });
  });

  it('serializes drafts into list item markdown with optional block id', () => {
    expect(parser.serializeRecord({ date: '2026-06-18', time: '09:12', type: 'memo', content: 'hello #tag', body: 'line 2' }, 'omm-20260618-091200-a1b2')).toBe('- 09:12\n  hello #tag\n  line 2 ^omm-20260618-091200-a1b2');
    expect(parser.serializeRecord({ date: '2026-06-18', time: '10:20', type: 'todo', content: 'task', completed: false }, undefined)).toBe('- [ ] 10:20 task');
    expect(parser.serializeRecord({ date: '2026-06-18', time: '10:20', type: 'todo', content: 'task', completed: true }, 'omm-20260618-102000-e5f6')).toBe('- [x] 10:20 task ^omm-20260618-102000-e5f6');
  });

  it('warns for non-list content inside Quick Memo section', () => {
    const markdown = '## Quick Memo\n\nPlain text line\n\n- 08:00 valid record\n';
    const result = parser.parseFile('test.md', '2026-06-18', markdown);
    expect(result.records).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      filePath: 'test.md',
      line: 3,
      message: 'Non-list content inside Quick Memo section was ignored.',
      raw: 'Plain text line',
    });
  });

  it('warns for unsupported list item inside Quick Memo section', () => {
    const markdown = '## Quick Memo\n\n- not a valid record\n\n- 08:00 valid record\n';
    const result = parser.parseFile('test.md', '2026-06-18', markdown);
    expect(result.records).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      filePath: 'test.md',
      line: 3,
      message: 'Quick Memo list item did not match a supported record format.',
      raw: '- not a valid record',
    });
  });

  it('warns once per duplicate Quick Memo block id and keeps all records', () => {
    const id = 'omm-20260618-090000-dup';
    const markdown = `## Quick Memo

- 09:00 first occurrence #a ^${id}
- 09:30 second occurrence #b ^${id}
- 10:00 unrelated record #c ^omm-20260618-100000-uniq
`;
    const result = parser.parseFile('Daily Notes/2026-06-18.md', '2026-06-18', markdown);

    expect(result.records).toHaveLength(3);
    expect(result.records.map((record) => record.id)).toEqual([id, id, 'omm-20260618-100000-uniq']);

    const duplicateWarnings = result.warnings.filter((warning) => warning.message.includes('Duplicate Quick Memo block id'));
    expect(duplicateWarnings).toHaveLength(1);
    expect(duplicateWarnings[0]).toMatchObject({
      filePath: 'Daily Notes/2026-06-18.md',
      line: result.records[1].lineStart,
      message: `Duplicate Quick Memo block id: ${id}`,
      raw: result.records[1].raw,
    });
  });

  it('reads the heading dynamically so settings changes take effect without rebuilding the parser', () => {
    let heading = 'Quick Memo';
    const dynamic = new QuickMemoParser(() => heading);
    const original = '## Quick Memo\n\n- 09:00 under old heading #x\n';
    expect(dynamic.parseFile('Daily Notes/2026-06-18.md', '2026-06-18', original).records).toHaveLength(1);

    heading = 'Memos';
    const renamed = '## Memos\n\n- 09:00 under new heading #x\n';
    expect(dynamic.parseFile('Daily Notes/2026-06-18.md', '2026-06-18', renamed).records).toHaveLength(1);
    expect(dynamic.parseFile('Daily Notes/2026-06-18.md', '2026-06-18', original).records).toHaveLength(0);
  });

  it('parses multi-line records with tab-indented continuation (legacy Thino format)', () => {
    const markdown = '## Quick Memo\n\n- 22:05\n\t今天的 Reddit 报料\n\t原文地址： https://example.com\n\t![[image.webp]]\n';
    const result = parser.parseFile('test.md', '2026-06-30', markdown);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      type: 'memo',
      time: '22:05',
      content: '今天的 Reddit 报料',
      body: '原文地址： https://example.com\n![[image.webp]]',
      hasStableId: false,
    });
  });

  it('parses bare memo with tab-indented block id at end', () => {
    const markdown = '## Quick Memo\n\n- 09:12\n\thello #tag\n\tline 2 ^omm-20260618-091200-a1b2\n';
    const result = parser.parseFile('test.md', '2026-06-18', markdown);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      id: 'omm-20260618-091200-a1b2',
      type: 'memo',
      time: '09:12',
      content: 'hello #tag',
      body: 'line 2',
      hasStableId: true,
      tags: ['#tag'],
    });
  });

  it('parses multi-line records with blockquote/callout continuation', () => {
    const markdown = '## Quick Memo\n\n- 20:47\n> [!microblog] ![](https://example.com/avatar.png) text · 20:47\n> 你好\n';
    const result = parser.parseFile('test.md', '2026-06-30', markdown);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      type: 'memo',
      time: '20:47',
      content: '> [!microblog] ![](https://example.com/avatar.png) text · 20:47',
      body: '> 你好',
      hasStableId: false,
    });
  });
});
