import { describe, expect, it } from 'vitest';
import type { QuickMemoRecord } from '../src/types';
import { dateRangeForPreset, filterRecordsForView, rollSelectedDate, sortRecordsForDisplay } from '../src/view/viewState';

const records: QuickMemoRecord[] = [
  makeRecord('1', '2026-06-18', '09:00', 'memo', 'idea #a'),
  makeRecord('2', '2026-06-18', '10:00', 'todo', 'task #b', true),
  makeRecord('3', '2026-06-17', '08:00', 'memo', 'note #a'),
];

describe('viewState', () => {
  it('filters by date, type, tag, text, and completed state', () => {
    expect(filterRecordsForView(records, { selectedDate: '2026-06-18', type: 'todo', tag: '#b', text: 'task', todoStatus: 'completed' }).map((record) => record.id)).toEqual(['2']);
  });

  it('filters completed todos only when todoStatus is completed', () => {
    const set: QuickMemoRecord[] = [
      makeRecord('open', '2026-06-18', '08:00', 'todo', 'open todo', false),
      makeRecord('done', '2026-06-18', '09:00', 'todo', 'done todo', true),
      makeRecord('note', '2026-06-18', '10:00', 'memo', 'plain note'),
    ];
    expect(filterRecordsForView(set, { type: 'todo', todoStatus: 'completed' }).map((record) => record.id)).toEqual(['done']);
  });

  it('ignores selectedDate when filtering by tag, spanning all dates', () => {
    // selectedDate is 2026-06-18, but tag #a also matches 2026-06-17 — both come back.
    expect(filterRecordsForView(records, { selectedDate: '2026-06-18', tag: '#a' }).map((record) => record.id)).toEqual(['1', '3']);
  });

  it('ignores selectedDate when filtering by text, spanning all dates', () => {
    expect(filterRecordsForView(records, { selectedDate: '2026-06-18', text: 'note' }).map((record) => record.id)).toEqual(['3']);
  });

  it('still applies selectedDate when no tag or text filter is set', () => {
    expect(filterRecordsForView(records, { selectedDate: '2026-06-18' }).map((record) => record.id)).toEqual(['1', '2']);
  });

  it('filters open todos only when todoStatus is open', () => {
    const set: QuickMemoRecord[] = [
      makeRecord('open', '2026-06-18', '08:00', 'todo', 'open todo', false),
      makeRecord('done', '2026-06-18', '09:00', 'todo', 'done todo', true),
      makeRecord('note', '2026-06-18', '10:00', 'memo', 'plain note'),
    ];
    expect(filterRecordsForView(set, { type: 'todo', todoStatus: 'open' }).map((record) => record.id)).toEqual(['open']);
  });

  it('computes date range presets', () => {
    expect(dateRangeForPreset('today', '2026-06-18')).toEqual({ startDate: '2026-06-18', endDate: '2026-06-18' });
    expect(dateRangeForPreset('7d', '2026-06-18')).toEqual({ startDate: '2026-06-12', endDate: '2026-06-18' });
  });

  describe('sortRecordsForDisplay', () => {
    const pair: QuickMemoRecord[] = [
      makeRecord('nine', '2026-06-18', '09:00', 'memo', 'morning'),
      makeRecord('ten', '2026-06-18', '10:00', 'memo', 'later'),
    ];

    it('returns newest first for desc (default)', () => {
      expect(sortRecordsForDisplay(pair, 'desc').map((record) => record.id)).toEqual(['ten', 'nine']);
    });

    it('returns oldest first for asc', () => {
      expect(sortRecordsForDisplay(pair, 'asc').map((record) => record.id)).toEqual(['nine', 'ten']);
    });

    it('does not mutate the input array', () => {
      const copy = [...pair];
      sortRecordsForDisplay(pair, 'desc');
      expect(pair.map((record) => record.id)).toEqual(copy.map((record) => record.id));
    });
  });

  describe('rollSelectedDate', () => {
    it('returns undefined when the day has not rolled over', () => {
      expect(rollSelectedDate('2026-06-19', '2026-06-19', '2026-06-19')).toBeUndefined();
    });

    it('follows the clock to the new day when the user was on today', () => {
      expect(rollSelectedDate('2026-06-19', '2026-06-19', '2026-06-20')).toBe('2026-06-20');
    });

    it('leaves a historical date untouched across midnight', () => {
      expect(rollSelectedDate('2026-06-10', '2026-06-19', '2026-06-20')).toBeUndefined();
    });
  });
});

function makeRecord(id: string, date: string, time: string, type: QuickMemoRecord['type'], content: string, completed?: boolean): QuickMemoRecord {
  return { id, date, time, type, content, tags: content.match(/#[a-z]/g) ?? [], completed, filePath: `${date}.md`, lineStart: 1, lineEnd: 1, hasStableId: true, raw: content, contentHash: id };
}
