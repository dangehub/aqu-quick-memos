import type { HeatmapDay, QuickMemoRecord, QuickMemoSettings, QuickMemoType } from '../types';
import type { TodoStatusFilter, TypeFilter, ViewFilters } from './viewState';

/** Markdown render bridge — render.ts stays free of Obsidian. The view injects
 *  the real MarkdownRenderer; tests fall back to the plain-text default. */
export interface MarkdownApi {
  render(source: string, el: HTMLElement): void;
}

const TEXT_MARKDOWN: MarkdownApi = {
  render: (source, el) => {
    el.textContent = source;
  },
};

export interface OverviewStats {
  /** Distinct dates that have at least one record. */
  days: number;
  /** Total record count across all dates. */
  total: number;
  memo: number;
  todo: number;
  /** Completed todos (subset of `todo`). */
  todoDone: number;
}

export interface OverviewState {
  settings: QuickMemoSettings;
  records: QuickMemoRecord[];
  tags: Array<[string, number]>;
  heatmap: HeatmapDay[];
  selectedDate: string;
  todayDate: string;
  editingRecordId?: string;
  openMenuRecordId?: string;
  inputMode?: 'memo' | 'todo';
  filters: ViewFilters;
  stats: OverviewStats;
  markdown?: MarkdownApi;
}

export interface OverviewCallbacks {
  onSave(draft: { type: QuickMemoType; content: string }): void;
  onSelectDate(date: string): void;
  onToggleTodo(record: QuickMemoRecord): void;
  onEdit(record: QuickMemoRecord): void;
  onSaveEdit(record: QuickMemoRecord, changes: { type: QuickMemoType; content: string; body?: string }): void;
  onCancelEdit(): void;
  onDelete(record: QuickMemoRecord): void;
  onCopyBlock(record: QuickMemoRecord): void;
  onOpenSource(record: QuickMemoRecord): void;
  onFilterChange(filters: Partial<ViewFilters>): void;
  onToggleMenu(recordId: string): void;
  onTagContext(tag: string, event: MouseEvent): void;
}

/** Type filter option values, including composite todo-status filters. */
type TypeFilterValue = TypeFilter | 'todo-done' | 'todo-open';

const TYPE_FILTER_OPTIONS: ReadonlyArray<readonly [TypeFilterValue, string]> = [
  ['all', '全部'],
  ['memo', '普通'],
  ['todo', '待办'],
  ['todo-done', '已完成待办'],
  ['todo-open', '未完成待办'],
];

export function renderOverview(root: HTMLElement, state: OverviewState, callbacks: OverviewCallbacks): void {
  root.innerHTML = '';
  root.classList.add('oqm-root');

  const markdown = state.markdown ?? TEXT_MARKDOWN;
  const layout = appendDiv(root, 'oqm-layout');
  renderSidebar(appendDiv(layout, 'oqm-sidebar'), state, callbacks);
  renderMain(appendDiv(layout, 'oqm-main'), state, callbacks, markdown);
}

function renderSidebar(container: HTMLElement, state: OverviewState, callbacks: OverviewCallbacks): void {
  const profile = appendDiv(container, 'oqm-profile');
  if (state.settings.avatar) {
    const avatar = appendEl(profile, 'img', 'oqm-avatar');
    avatar.src = state.settings.avatar;
    avatar.alt = state.settings.userName;
  }
  const profileText = appendDiv(profile, 'oqm-profile-text');
  appendEl(profileText, 'h2', '', state.settings.userName);
  appendEl(profileText, 'p', '', state.settings.userSlogan);

  // Heatmap sits between the profile/slogan and the filter controls.
  renderHeatmap(container, state.heatmap, state.todayDate, state.selectedDate, callbacks);
  renderStats(container, state.stats);

  appendDiv(container, 'oqm-section-label', '筛选');

  const typeSelect = appendEl(container, 'select', 'oqm-type-filter');
  for (const [value, label] of TYPE_FILTER_OPTIONS) {
    appendOption(typeSelect, label, value);
  }
  typeSelect.value = filterValueFromState(state.filters);
  typeSelect.onchange = () => {
    const value = typeSelect.value as TypeFilterValue;
    if (value === 'todo-done') {
      callbacks.onFilterChange({ type: 'todo', todoStatus: 'completed' as TodoStatusFilter });
    } else if (value === 'todo-open') {
      callbacks.onFilterChange({ type: 'todo', todoStatus: 'open' as TodoStatusFilter });
    } else {
      callbacks.onFilterChange({ type: value as TypeFilter, todoStatus: undefined });
    }
  };

  const search = appendEl(container, 'input', 'oqm-search');
  search.type = 'search';
  search.placeholder = '关键词搜索（回车搜索）';
  search.value = state.filters.text ?? '';
  // No search while typing: it interrupts IME/Chinese composition and rebuilds the
  // DOM per keystroke. Search runs on Enter — but not the Enter that confirms an
  // IME candidate — and on blur (deferred so the click that stole focus completes).
  const runSearch = (): void => {
    callbacks.onFilterChange({ text: search.value });
  };
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      runSearch();
    }
  });
  search.addEventListener('blur', () => {
    window.setTimeout(runSearch, 0);
  });

  if (state.tags.length > 0) {
    appendDiv(container, 'oqm-section-label', '标签');
    const tags = appendDiv(container, 'oqm-tags');
    for (const [tag, count] of state.tags) {
      const selected = state.filters.tag === tag;
      const button = appendEl(tags, 'button', selected ? 'oqm-tag-selected' : '', `${tag} ${count}`);
      button.setAttribute('aria-pressed', String(selected));
      button.title = selected ? '再次点击取消标签筛选' : '按此标签筛选';
      button.onclick = () => callbacks.onFilterChange({ tag: selected ? undefined : tag });
      button.oncontextmenu = (event: MouseEvent) => {
        event.preventDefault();
        callbacks.onTagContext(tag, event);
      };
    }
  }
}

function renderMain(container: HTMLElement, state: OverviewState, callbacks: OverviewCallbacks, markdown: MarkdownApi): void {
  const composer = appendDiv(container, 'oqm-composer');

  // First row: type selector on the left, the date the record will save to on the
  // right, so the user always knows which day they're capturing into.
  const row = appendDiv(composer, 'oqm-composer-row');
  const type = appendEl(row, 'select', 'oqm-type');
  for (const [value, label] of TYPE_OPTIONS) {
    appendOption(type, label, value);
  }
  type.value = state.inputMode ?? 'memo';
  appendDiv(row, 'oqm-composer-date', state.selectedDate);

  // Plain markdown source editor. (The cards below render the markdown; the
  // composer itself stays a source textarea.)
  const input = appendEl(composer, 'textarea', 'oqm-input');
  input.placeholder = '输入 Markdown，Cmd/Ctrl + Enter 保存';

  const save = appendEl(composer, 'button', 'oqm-save', '保存');
  const submit = (): void => {
    const content = input.value.trim();
    if (!content) return;
    callbacks.onSave({ type: type.value as QuickMemoType, content });
    input.value = '';
  };
  save.onclick = submit;
  input.onkeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
  };

  // Tag / keyword filters are vault-wide: group the results by date instead of
  // showing a single-day timeline. Otherwise it's the normal single-day view.
  const crossDate = Boolean(state.filters.tag) || Boolean(state.filters.text?.trim());
  if (crossDate) {
    renderCrossDateTimeline(container, state, callbacks, markdown);
    return;
  }

  appendEl(container, 'h3', '', `${state.selectedDate} 时间线`);
  const list = appendDiv(container, 'oqm-record-list');
  if (state.records.length === 0) {
    appendDiv(list, 'oqm-empty', '这一天还没有 Quick Memo。');
    return;
  }

  for (const record of state.records) {
    const key = recordKey(record);
    renderRecord(list, record, state.editingRecordId === key, state.openMenuRecordId === key, callbacks, markdown);
  }
}

function renderCrossDateTimeline(container: HTMLElement, state: OverviewState, callbacks: OverviewCallbacks, markdown: MarkdownApi): void {
  appendEl(container, 'h3', '', '筛选结果');
  if (state.records.length === 0) {
    const list = appendDiv(container, 'oqm-record-list');
    appendDiv(list, 'oqm-empty', '没有匹配的 Quick Memo。');
    return;
  }

  // Records arrive already sorted (newest first). Group them by date, preserving
  // that order, so each heading is followed by its day's records.
  const groups = new Map<string, QuickMemoRecord[]>();
  for (const record of state.records) {
    const bucket = groups.get(record.date) ?? [];
    bucket.push(record);
    groups.set(record.date, bucket);
  }

  const list = appendDiv(container, 'oqm-record-list');
  for (const [date, groupRecords] of groups) {
    const group = appendDiv(list, 'oqm-date-group');
    appendDiv(group, 'oqm-date-group-heading', date);
    const cards = appendDiv(group, 'oqm-date-group-cards');
    for (const record of groupRecords) {
      const key = recordKey(record);
      renderRecord(cards, record, state.editingRecordId === key, state.openMenuRecordId === key, callbacks, markdown);
    }
  }
}

function renderRecord(list: HTMLElement, record: QuickMemoRecord, editing: boolean, menuOpen: boolean, callbacks: OverviewCallbacks, markdown: MarkdownApi): void {
  const card = appendDiv(list, `oqm-record oqm-record-${record.type}${record.completed ? ' is-done' : ''}`);

  // Top-right "more" trigger; actions live in a dropdown rather than a bottom row.
  const trigger = appendEl(card, 'button', 'oqm-record-menu-trigger');
  trigger.type = 'button';
  trigger.textContent = '⋮';
  trigger.setAttribute('aria-label', '更多操作');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', String(menuOpen));
  trigger.onclick = () => callbacks.onToggleMenu(recordKey(record));

  const meta = appendDiv(card, 'oqm-record-meta');
  appendEl(meta, 'span', '', record.time);
  const badge = appendEl(meta, 'span', 'oqm-record-badge') as HTMLElement;
  badge.textContent = typeLabel(record.type);
  if (record.type === 'todo') badge.textContent += record.completed ? ' · 已完成' : ' · 未完成';

  if (editing) {
    const editType = appendEl(card, 'select', 'oqm-edit-type');
    for (const [value, label] of TYPE_OPTIONS) {
      appendOption(editType, label, value);
    }
    editType.value = record.type;

    const editor = appendEl(card, 'textarea', 'oqm-edit-input');
    editor.value = record.body ? `${record.content}\n${record.body}` : record.content;
    window.setTimeout(() => editor.focus(), 0);

    const editActions = appendDiv(card, 'oqm-record-actions');
    (appendEl(editActions, 'button', '', '保存')).onclick = () => {
      const [content, ...bodyLines] = editor.value.replace(/\r\n/gu, '\n').split('\n');
      callbacks.onSaveEdit(record, {
        type: editType.value as QuickMemoType,
        content: content.trim(),
        body: bodyLines.join('\n') || undefined,
      });
    };
    (appendEl(editActions, 'button', '', '取消')).onclick = () => callbacks.onCancelEdit();
    return;
  }

  // Rendered markdown content. Todo records get a checkbox that toggles the
  // record's completion, which syncs the `- [ ]`/`- [x]` marker in the file.
  const body = appendDiv(card, 'oqm-record-body');
  if (record.type === 'todo') {
    const checkbox = appendEl(body, 'input', 'oqm-record-checkbox');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(record.completed);
    checkbox.setAttribute('aria-label', record.completed ? '标记为未完成' : '标记为完成');
    if (record.id) {
      checkbox.onchange = () => callbacks.onToggleTodo(record);
    } else {
      checkbox.disabled = true;
    }
  }
  const contentEl = appendDiv(body, 'oqm-record-content');
  markdown.render(record.body ? `${record.content}\n${record.body}` : record.content, contentEl);

  if (menuOpen) {
    const menu = appendDiv(card, 'oqm-record-menu');
    if (record.type === 'todo') {
      addMenuItem(menu, record.completed ? '标记未完成' : '标记完成', () => callbacks.onToggleTodo(record));
    }
    addMenuItem(menu, '编辑', () => callbacks.onEdit(record));
    addMenuItem(menu, '复制块链接', () => callbacks.onCopyBlock(record));
    addMenuItem(menu, '打开源文件', () => callbacks.onOpenSource(record));
    appendDiv(menu, 'oqm-record-menu-divider');
    addMenuItem(menu, '删除', () => callbacks.onDelete(record), 'oqm-record-menu-item-danger');
  }
}

function addMenuItem(menu: HTMLElement, label: string, handler: () => void, cls?: string): void {
  const item = appendEl(menu, 'button', `oqm-record-menu-item${cls ? ` ${cls}` : ''}`, label);
  item.type = 'button';
  item.onclick = handler;
}

/** Stable per-record key for view state (editing/open-menu). Falls back to a
 *  file+line locator when a record has no block id (pure-markdown mode). */
export function recordKey(record: QuickMemoRecord): string {
  return record.id ?? `${record.filePath}:${record.lineStart}`;
}

function renderStats(container: HTMLElement, stats: OverviewStats): void {
  const block = appendDiv(container, 'oqm-stats');
  const ratioPct = stats.todo > 0 ? Math.round((stats.todoDone / stats.todo) * 1000) / 10 : 0;

  // Top row: the two record types (memo / todo).
  const typesRow = appendDiv(block, 'oqm-stats-row oqm-stats-types');
  addStatCard(typesRow, String(stats.memo), '普通');
  addStatCard(typesRow, String(stats.todo), '待办');

  // Bottom row: usage breadth — days used and total records, each filling half.
  const breadthRow = appendDiv(block, 'oqm-stats-row oqm-stats-breadth');
  addStatCard(breadthRow, String(stats.days), '使用天数');
  addStatCard(breadthRow, String(stats.total), '总记录');

  // Completion ratio: a thin progress bar with just the done/total figure.
  const ratio = appendDiv(block, 'oqm-stats-ratio');
  const bar = appendDiv(ratio, 'oqm-stats-ratio-bar');
  const fill = appendDiv(bar, 'oqm-stats-ratio-fill');
  fill.style.width = `${ratioPct}%`;
  appendDiv(ratio, 'oqm-stats-ratio-text', `${stats.todoDone}/${stats.todo}`);
}

function addStatCard(parent: HTMLElement, num: string, label: string): void {
  const card = appendDiv(parent, 'oqm-stat-card');
  appendDiv(card, 'oqm-stat-num', num);
  appendDiv(card, 'oqm-stat-label', label);
}

function renderHeatmap(container: HTMLElement, heatmap: HeatmapDay[], todayDate: string, selectedDate: string, callbacks: OverviewCallbacks): void {
  const counts = new Map<string, number>();
  for (const day of heatmap) counts.set(day.date, day.count);
  const max = Math.max(1, ...heatmap.map((day) => day.count));

  // Header row: "近 3 个月活动" label on the left, a "今天" jump link on the right
  // (only when the user is browsing a historical date).
  const header = appendDiv(container, 'oqm-heatmap-header');
  appendDiv(header, 'oqm-section-label', '近 3 个月活动');
  if (selectedDate !== todayDate) {
    const today = appendEl(header, 'button', 'oqm-heatmap-today', '今天');
    today.type = 'button';
    today.title = '回到今天';
    today.onclick = () => callbacks.onSelectDate(todayDate);
  }

  // A single flat stream of exactly 90 small squares, anchored at the 1st of the
  // month two months before today. Today therefore falls inside the grid (not at
  // the end), and the count is always 90 regardless of the selected date.
  const grid = appendDiv(container, 'oqm-heatmap-grid');
  const [year, month] = todayDate.split('-').map((part) => Number(part));
  const cursor = new Date(year, month - 3, 1); // 1st of (this month - 2)

  for (let i = 0; i < 90; i += 1) {
    const dateStr = formatDay(cursor);
    const count = counts.get(dateStr) ?? 0;
    const level = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
    const isSelected = dateStr === selectedDate;
    const button = appendEl(grid, 'button', `oqm-heatmap-day oqm-heatmap-level-${level}${isSelected ? ' oqm-heatmap-selected' : ''}`);
    button.type = 'button';
    button.title = `${dateStr}：${count} 条`;
    button.setAttribute('aria-label', `${dateStr}，${count} 条记录`);
    button.onclick = () => callbacks.onSelectDate(dateStr);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function formatDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function typeLabel(type: QuickMemoType): string {
  return type === 'memo' ? '普通' : '待办';
}

const TYPE_OPTIONS: ReadonlyArray<readonly [QuickMemoType, string]> = [
  ['memo', '普通'],
  ['todo', '待办'],
];

/** Map the current view filters back to a composite select value. */
function filterValueFromState(filters: ViewFilters): TypeFilterValue {
  if (filters.type === 'todo' && filters.todoStatus === 'completed') return 'todo-done';
  if (filters.type === 'todo' && filters.todoStatus === 'open') return 'todo-open';
  return filters.type ?? 'all';
}

function appendDiv(parent: HTMLElement, cls: string, text?: string): HTMLDivElement {
  return appendEl(parent, 'div', cls, text);
}

function appendEl<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = activeDocument.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

function appendOption(select: HTMLSelectElement, label: string, value: string): void {
  const option = activeDocument.createElement('option');
  option.textContent = label;
  option.value = value;
  select.appendChild(option);
}
