import { describe, expect, it, vi } from 'vitest';
import type { QuickMemoRecord } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import { renderOverview } from '../src/view/render';
import type { OverviewStats } from '../src/view/render';

type Stats = OverviewStats;

describe('renderOverview', () => {
  it('renders profile, input, records, filters, and heatmap', () => {
    const root = document.createElement('div');
    const callbacks = makeCallbacks();

    renderOverview(root, {
      settings: { ...DEFAULT_SETTINGS, userName: 'Ada', userSlogan: 'Think clearly' },
      records: [makeRecord('omm-1', '2026-06-18', '09:00', 'memo', 'idea #a')],
      tags: [['#a', 1]],
      heatmap: [{ date: '2026-06-18', count: 1 }],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 1,
      viewMode: 'all',
    }, callbacks);

    expect(root.querySelector('.omm-layout')).toBeTruthy();
    expect(root.textContent).toContain('Ada');
    expect(root.textContent).toContain('Think clearly');
    expect(root.textContent).toContain('idea #a');
    expect(root.textContent).toContain('#a');
    expect(root.querySelector<HTMLTextAreaElement>('.omm-input')?.placeholder).toContain('Markdown');
    expect(root.querySelectorAll('.omm-heatmap-month-header')).toHaveLength(0);
    const dayCells = root.querySelectorAll('.omm-heatmap-day');
    // Single-month view: June 2026 has 30 active days.
    expect(dayCells).toHaveLength(30);
    const recordDay = Array.from(dayCells).find((cell) => cell.getAttribute('title') === '2026-06-18：1 条');
    expect(recordDay?.classList.contains('omm-heatmap-level-4')).toBe(true);
    expect(recordDay?.classList.contains('omm-heatmap-selected')).toBe(true);
  });

  it('calls onSelectDate when a heatmap day is clicked', () => {
    const root = document.createElement('div');
    const callbacks = makeCallbacks();
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [{ date: '2026-06-15', count: 2 }],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, callbacks);

    const day15 = Array.from(root.querySelectorAll('.omm-heatmap-day')).find((cell) => cell.getAttribute('title')?.startsWith('2026-06-15')) as HTMLButtonElement;
    day15.click();
    expect(callbacks.onSelectDate).toHaveBeenCalledWith('2026-06-15');
  });

  it('renders record actions behind a top-right menu, not a bottom action row', () => {
    const root = document.createElement('div');
    const callbacks = makeCallbacks();
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [makeRecord('omm-9', '2026-06-18', '09:00', 'memo', 'idea #a')],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 1,
      viewMode: 'all',
    }, callbacks);

    expect(root.querySelector('.omm-record-actions')).toBeNull();
    expect(root.querySelector('.omm-record-menu')).toBeNull();
    const trigger = root.querySelector('.omm-record-menu-trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();

    trigger.click();
    expect(callbacks.onToggleMenu).toHaveBeenCalledWith('omm-9');
  });

  it('shows the action menu only for the open record', () => {
    const root = document.createElement('div');
    const callbacks = makeCallbacks();
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [makeRecord('omm-9', '2026-06-18', '09:00', 'todo', 'task #t', false)],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: 'omm-9',
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 1,
      viewMode: 'all',
    }, callbacks);

    const items = Array.from(root.querySelectorAll('.omm-record-menu-item')) as HTMLButtonElement[];
    expect(items.map((item) => item.textContent)).toEqual(['标记完成', '编辑', '复制块链接', '打开源文件', '删除']);
    items[0].click();
    expect(callbacks.onToggleTodo).toHaveBeenCalled();
    items[4].click();
    expect(callbacks.onDelete).toHaveBeenCalled();
  });

  it('toggles an already-selected tag off when clicked again', () => {
    const root = document.createElement('div');
    const callbacks = makeCallbacks();
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [['#a', 2]],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: { tag: '#a' },
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, callbacks);

    const tagButton = root.querySelector<HTMLButtonElement>('.omm-tags button')!;
    expect(tagButton.classList.contains('omm-tag-selected')).toBe(true);
    expect(tagButton.getAttribute('aria-pressed')).toBe('true');
    tagButton.click();
    expect(callbacks.onFilterChange).toHaveBeenCalledWith({ tag: undefined });
  });

  it('offers five type filter options including todo status composites', () => {
    const root = document.createElement('div');
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, makeCallbacks());

    const select = root.querySelector<HTMLSelectElement>('.omm-type-filter');
    expect(select).toBeTruthy();
    const options = Array.from(select!.querySelectorAll('option'));
    expect(options).toHaveLength(5);
    const values = options.map((option) => option.value);
    expect(values).toEqual(['all', 'memo', 'todo', 'todo-done', 'todo-open']);
    const labels = options.map((option) => option.textContent);
    expect(labels).toEqual(['全部', '闪念', '待办', '已完成待办', '未完成待办']);
  });

  it('reflects todo-done and todo-open composite filters in the select value', () => {
    const doneRoot = document.createElement('div');
    renderOverview(doneRoot, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      filters: { type: 'todo', todoStatus: 'completed' },
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, makeCallbacks());
    expect(doneRoot.querySelector<HTMLSelectElement>('.omm-type-filter')?.value).toBe('todo-done');

    const openRoot = document.createElement('div');
    renderOverview(openRoot, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      filters: { type: 'todo', todoStatus: 'open' },
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, makeCallbacks());
    expect(openRoot.querySelector<HTMLSelectElement>('.omm-type-filter')?.value).toBe('todo-open');
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
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, callbacks);

    const select = root.querySelector<HTMLSelectElement>('.omm-type-filter')!;

    select.value = 'todo-done';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onFilterChange).toHaveBeenLastCalledWith({ type: 'todo', todoStatus: 'completed' });

    select.value = 'todo-open';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onFilterChange).toHaveBeenLastCalledWith({ type: 'todo', todoStatus: 'open' });

    select.value = 'memo';
    select.dispatchEvent(new Event('change'));
    expect(callbacks.onFilterChange).toHaveBeenLastCalledWith({ type: 'memo', todoStatus: undefined });
  });

  it('renders global stats below the heatmap', () => {
    const root = document.createElement('div');
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats({ days: 3, total: 10, memo: 7, todo: 3, todoDone: 2 }),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, makeCallbacks());

    const stats = root.querySelector('.omm-stats');
    expect(stats).toBeTruthy();
    expect(stats!.textContent).toContain('3');
    expect(stats!.textContent).toContain('10');
    expect(stats!.textContent).toContain('闪念');
    expect(stats!.textContent).toContain('待办');
    expect(stats!.textContent).toContain('2/3');
    const bar = stats!.querySelector<HTMLDivElement>('.omm-stats-ratio-bar > div');
    expect(bar).toBeTruthy();
    expect(bar!.style.width).toBe('66.7%');
  });

  it('shows a 今天 link when a non-today date is selected and jumps back to today on click', () => {
    const root = document.createElement('div');
    const callbacks = makeCallbacks();
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-10',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, callbacks);

    const todayLink = root.querySelector<HTMLButtonElement>('.omm-heatmap-today');
    expect(todayLink).toBeTruthy();
    todayLink!.click();
    expect(callbacks.onSelectDate).toHaveBeenCalledWith('2026-06-18');
  });

  it('shows the 今天 button in disabled state when today is already selected', () => {
    const root = document.createElement('div');
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, makeCallbacks());

    const todayBtn = root.querySelector<HTMLButtonElement>('.omm-heatmap-today');
    expect(todayBtn).toBeTruthy();
    expect(todayBtn!.disabled).toBe(true);
    expect(todayBtn!.classList.contains('omm-heatmap-today--current')).toBe(true);
  });

  it('shows the selected date next to the composer type selector', () => {
    const root = document.createElement('div');
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [],
      tags: [],
      heatmap: [],
      selectedDate: '2026-06-21',
      todayDate: '2026-06-21',
      editingRecordId: undefined,
      filters: {},
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 0,
      viewMode: 'all',
    }, makeCallbacks());

    expect(root.querySelector('.omm-composer-date')?.textContent).toBe('2026-06-21');
  });

  it('groups records by date when a tag or text filter spans multiple dates', () => {
    const root = document.createElement('div');
    renderOverview(root, {
      settings: DEFAULT_SETTINGS,
      records: [
        makeRecord('1', '2026-06-18', '09:00', 'memo', 'idea #a'),
        makeRecord('2', '2026-06-17', '08:00', 'memo', 'note #a'),
      ],
      tags: [['#a', 2]],
      heatmap: [],
      selectedDate: '2026-06-18',
      todayDate: '2026-06-18',
      editingRecordId: undefined,
      openMenuRecordId: undefined,
      filters: { tag: '#a' },
      stats: makeStats(),
      warningCount: 0,
      sortDirection: 'desc',
      sidebarCollapsed: false,
      recordsTotal: 2,
      viewMode: 'all',
    }, makeCallbacks());

    const headingRow = root.querySelector('.omm-heading-row');
    expect(headingRow?.querySelector('h3')?.textContent).toBe('筛选结果');
    expect(headingRow?.querySelector('.omm-sort-toggle')).toBeTruthy();
    const groupHeadings = Array.from(root.querySelectorAll('.omm-date-group-heading')).map((el) => el.textContent);
    expect(groupHeadings).toEqual(['2026-06-18', '2026-06-17']);
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
    onToggleMenu: vi.fn(),
    onTagContext: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleSort: vi.fn(),
    onLoadMore: vi.fn(),
    onShowAll: vi.fn(),
    onApplyDateRange: vi.fn(),
    onHeatmapPrevMonth: vi.fn(),
    onHeatmapNextMonth: vi.fn(),
    onAttachFile: vi.fn(),
  };
}

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return { days: 2, total: 4, memo: 2, todo: 2, todoDone: 1, ...overrides };
}

function makeRecord(id: string, date: string, time: string, type: QuickMemoRecord['type'], content: string, completed?: boolean): QuickMemoRecord {
  return { id, date, time, type, content, tags: content.match(/#[a-z]/g) ?? [], completed, filePath: `${date}.md`, lineStart: 1, lineEnd: 1, hasStableId: true, raw: content, contentHash: id };
}
