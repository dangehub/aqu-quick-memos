import type { DateRangePreset, QuickMemoRecord, QuickMemoType, SortDirection } from '../types';

export type TypeFilter = 'all' | QuickMemoType;
export type TodoStatusFilter = 'all' | 'completed' | 'open';

export interface ViewFilters {
  selectedDate?: string;
  type?: TypeFilter;
  tag?: string;
  text?: string;
  todoStatus?: TodoStatusFilter;
}

export function filterRecordsForView(records: QuickMemoRecord[], filters: ViewFilters): QuickMemoRecord[] {
  const text = filters.text?.trim().toLowerCase();
  return records.filter((record) => {
    if (filters.selectedDate && record.date !== filters.selectedDate) return false;
    if (filters.type && filters.type !== 'all' && record.type !== filters.type) return false;
    if (filters.tag && !record.tags.includes(filters.tag)) return false;
    if (filters.todoStatus === 'completed' && record.completed !== true) return false;
    if (filters.todoStatus === 'open' && record.completed !== false) return false;
    if (text) {
      const haystack = `${record.content}\n${record.body ?? ''}\n${record.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

/**
 * Sort a copy of the records for display. Records that share a selectedDate are
 * ordered by time. `desc` (the spec default) puts the newest record first.
 */
export function sortRecordsForDisplay(records: QuickMemoRecord[], direction: SortDirection): QuickMemoRecord[] {
  return [...records].sort((a, b) => {
    const cmp = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    return direction === 'asc' ? cmp : -cmp;
  });
}

export function dateRangeForPreset(preset: DateRangePreset, today: string): { startDate: string; endDate: string } | undefined {
  if (preset === 'custom') return undefined;
  const days = preset === 'today' ? 1 : preset === '7d' ? 7 : 30;
  return { startDate: addDays(today, -(days - 1)), endDate: today };
}

function addDays(date: string, delta: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}
