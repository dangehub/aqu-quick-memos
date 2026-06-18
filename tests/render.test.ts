import { describe, expect, it, vi } from 'vitest';
import type { QuickMemoRecord } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import { renderOverview } from '../src/view/render';

describe('renderOverview', () => {
  it('renders profile, input, records, filters, and heatmap', () => {
    const root = document.createElement('div');
    const callbacks = {
      onSave: vi.fn(),
      onSelectDate: vi.fn(),
      onToggleTodo: vi.fn(),
      onEdit: vi.fn(),
      onSaveEdit: vi.fn(),
      onCancelEdit: vi.fn(),
      onDelete: vi.fn(),
      onCopyBlock: vi.fn(),
      onOpenSource: vi.fn(),
      onFilterChange: vi.fn(),
    };

    renderOverview(root, {
      settings: { ...DEFAULT_SETTINGS, userName: 'Ada', userSlogan: 'Think clearly' },
      records: [makeRecord('oqm-1', '2026-06-18', '09:00', 'flash', 'idea #a')],
      tags: [['#a', 1]],
      heatmap: [{ date: '2026-06-18', count: 1 }],
      selectedDate: '2026-06-18',
      editingRecordId: undefined,
      filters: {},
    }, callbacks);

    expect(root.querySelector('.oqm-layout')).toBeTruthy();
    expect(root.textContent).toContain('Ada');
    expect(root.textContent).toContain('Think clearly');
    expect(root.textContent).toContain('idea #a');
    expect(root.textContent).toContain('#a');
    expect(root.querySelector<HTMLTextAreaElement>('.oqm-input')?.placeholder).toContain('Markdown');
    expect(root.querySelectorAll('.oqm-heatmap-day')).toHaveLength(1);
  });

  it('offers all six type filter options including todo status composites', () => {
    const root = document.createElement('div');
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      editingRecordId: undefined,
      filters: {},
    }, makeCallbacks());

    const select = root.querySelector<HTMLSelectElement>('.oqm-type-filter');
    expect(select).toBeTruthy();
    const options = Array.from(select!.querySelectorAll('option'));
    expect(options).toHaveLength(6);
    const values = options.map((option) => option.value);
    expect(values).toEqual(['all', 'record', 'flash', 'todo', 'todo-done', 'todo-open']);
    const labels = options.map((option) => option.textContent);
    expect(labels).toEqual(['全部', '记录', '闪念', '待办', '已完成待办', '未完成待办']);
  });

  it('reflects todo-done and todo-open composite filters in the select value', () => {
    const doneRoot = document.createElement('div');
    renderOverview(doneRoot, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      editingRecordId: undefined,
      filters: { type: 'todo', todoStatus: 'completed' },
    }, makeCallbacks());
    expect(doneRoot.querySelector<HTMLSelectElement>('.oqm-type-filter')?.value).toBe('todo-done');

    const openRoot = document.createElement('div');
    renderOverview(openRoot, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      editingRecordId: undefined,
      filters: { type: 'todo', todoStatus: 'open' },
    }, makeCallbacks());
    expect(openRoot.querySelector<HTMLSelectElement>('.oqm-type-filter')?.value).toBe('todo-open');
  });

  it('dispatches composite filters with todoStatus and clears it for plain types', () => {
    const root = document.createElement('div');
    const callbacks = makeCallbacks();
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      editingRecordId: undefined,
      filters: {},
    }, callbacks);

    const select = root.querySelector<HTMLSelectElement>('.oqm-type-filter')!;

    select.value = 'todo-done';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onFilterChange).toHaveBeenLastCalledWith({ type: 'todo', todoStatus: 'completed' });

    select.value = 'todo-open';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onFilterChange).toHaveBeenLastCalledWith({ type: 'todo', todoStatus: 'open' });

    select.value = 'flash';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onFilterChange).toHaveBeenLastCalledWith({ type: 'flash', todoStatus: undefined });
  });
});

function makeCallbacks() {
  return {
    onSave: vi.fn(),
    onSelectDate: vi.fn(),
    onToggleTodo: vi.fn(),
    onEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onDelete: vi.fn(),
    onCopyBlock: vi.fn(),
    onOpenSource: vi.fn(),
    onFilterChange: vi.fn(),
  };
}

function makeRecord(id: string, date: string, time: string, type: QuickMemoRecord['type'], content: string): QuickMemoRecord {
  return { id, date, time, type, content, tags: content.match(/#[a-z]/g) ?? [], filePath: `${date}.md`, lineStart: 1, lineEnd: 1, hasStableId: true, raw: content, contentHash: id };
}
