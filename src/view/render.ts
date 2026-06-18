import type { HeatmapDay, QuickMemoRecord, QuickMemoSettings, QuickMemoType } from '../types';
import type { TodoStatusFilter, TypeFilter, ViewFilters } from './viewState';

export interface OverviewState {
  settings: QuickMemoSettings;
  records: QuickMemoRecord[];
  tags: Array<[string, number]>;
  heatmap: HeatmapDay[];
  selectedDate: string;
  todayDate: string;
  editingRecordId?: string;
  filters: ViewFilters;
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
}

/** Type filter option values, including composite todo-status filters. */
type TypeFilterValue = TypeFilter | 'todo-done' | 'todo-open';

const TYPE_FILTER_OPTIONS: ReadonlyArray<readonly [TypeFilterValue, string]> = [
  ['all', '全部'],
  ['record', '记录'],
  ['flash', '闪念'],
  ['todo', '待办'],
  ['todo-done', '已完成待办'],
  ['todo-open', '未完成待办'],
];

export function renderOverview(root: HTMLElement, state: OverviewState, callbacks: OverviewCallbacks): void {
  root.innerHTML = '';
  root.classList.add('oqm-root');

  const layout = appendDiv(root, 'oqm-layout');
  renderSidebar(appendDiv(layout, 'oqm-sidebar'), state, callbacks);
  renderMain(appendDiv(layout, 'oqm-main'), state, callbacks);
}

function renderSidebar(container: HTMLElement, state: OverviewState, callbacks: OverviewCallbacks): void {
  const profile = appendDiv(container, 'oqm-profile');
  if (state.settings.avatar) {
    const avatar = appendEl(profile, 'img', 'oqm-avatar') as HTMLImageElement;
    avatar.src = state.settings.avatar;
    avatar.alt = state.settings.userName;
  }
  const profileText = appendDiv(profile, 'oqm-profile-text');
  appendEl(profileText, 'h2', '', state.settings.userName);
  appendEl(profileText, 'p', '', state.settings.userSlogan);

  // Heatmap sits between the profile/slogan and the filter controls.
  renderHeatmap(container, state.heatmap, state.todayDate, state.selectedDate, callbacks);

  appendDiv(container, 'oqm-section-label', '筛选');

  const typeSelect = appendEl(container, 'select', 'oqm-type-filter') as HTMLSelectElement;
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

  const search = appendEl(container, 'input', 'oqm-search') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = '关键词搜索';
  search.value = state.filters.text ?? '';
  search.oninput = () => callbacks.onFilterChange({ text: search.value });

  if (state.tags.length > 0) {
    appendDiv(container, 'oqm-section-label', '标签');
    const tags = appendDiv(container, 'oqm-tags');
    for (const [tag, count] of state.tags) {
      const button = appendEl(tags, 'button', '', `${tag} ${count}`) as HTMLButtonElement;
      button.onclick = () => callbacks.onFilterChange({ tag });
    }
  }
}

function renderMain(container: HTMLElement, state: OverviewState, callbacks: OverviewCallbacks): void {
  const composer = appendDiv(container, 'oqm-composer');
  const type = appendEl(composer, 'select', 'oqm-type') as HTMLSelectElement;
  for (const [value, label] of TYPE_OPTIONS) {
    appendOption(type, label, value);
  }
  type.value = state.settings.defaultRecordType;

  const input = appendEl(composer, 'textarea', 'oqm-input') as HTMLTextAreaElement;
  input.placeholder = '输入 Markdown，Cmd/Ctrl + Enter 保存';

  const save = appendEl(composer, 'button', 'oqm-save', '保存') as HTMLButtonElement;
  const submit = (): void => {
    const content = input.value.trim();
    if (!content) return;
    callbacks.onSave({ type: type.value as QuickMemoType, content });
  };
  save.onclick = submit;
  input.onkeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
  };

  appendEl(container, 'h3', '', `${state.selectedDate} 时间线`);
  const list = appendDiv(container, 'oqm-record-list');
  if (state.records.length === 0) {
    appendDiv(list, 'oqm-empty', '这一天还没有 Quick Memo。');
    return;
  }

  for (const record of state.records) {
    renderRecord(list, record, state.editingRecordId === record.id, callbacks);
  }
}

function renderRecord(list: HTMLElement, record: QuickMemoRecord, editing: boolean, callbacks: OverviewCallbacks): void {
  const card = appendDiv(list, `oqm-record oqm-record-${record.type}`);
  const meta = appendDiv(card, 'oqm-record-meta');
  appendEl(meta, 'span', '', record.time);
  const badge = appendEl(meta, 'span', 'oqm-record-badge') as HTMLElement;
  badge.textContent = typeLabel(record.type);
  if (record.type === 'todo') badge.textContent += record.completed ? ' · 已完成' : ' · 未完成';

  if (editing) {
    const editType = appendEl(card, 'select', 'oqm-edit-type') as HTMLSelectElement;
    for (const [value, label] of TYPE_OPTIONS) {
      appendOption(editType, label, value);
    }
    editType.value = record.type;

    const editor = appendEl(card, 'textarea', 'oqm-edit-input') as HTMLTextAreaElement;
    editor.value = record.body ? `${record.content}\n${record.body}` : record.content;

    const editActions = appendDiv(card, 'oqm-record-actions');
    (appendEl(editActions, 'button', '', '保存') as HTMLButtonElement).onclick = () => {
      const [content, ...bodyLines] = editor.value.replace(/\r\n/gu, '\n').split('\n');
      callbacks.onSaveEdit(record, {
        type: editType.value as QuickMemoType,
        content: content.trim(),
        body: bodyLines.join('\n') || undefined,
      });
    };
    (appendEl(editActions, 'button', '', '取消') as HTMLButtonElement).onclick = () => callbacks.onCancelEdit();
    return;
  }

  appendDiv(card, 'oqm-record-content', record.body ? `${record.content}\n${record.body}` : record.content);

  const actions = appendDiv(card, 'oqm-record-actions');
  if (record.type === 'todo') {
    const toggle = appendEl(actions, 'button', '', record.completed ? '标记未完成' : '完成') as HTMLButtonElement;
    toggle.onclick = () => callbacks.onToggleTodo(record);
  }
  (appendEl(actions, 'button', '', '编辑') as HTMLButtonElement).onclick = () => callbacks.onEdit(record);
  (appendEl(actions, 'button', '', '删除') as HTMLButtonElement).onclick = () => callbacks.onDelete(record);
  (appendEl(actions, 'button', '', '复制块链接') as HTMLButtonElement).onclick = () => callbacks.onCopyBlock(record);
  (appendEl(actions, 'button', '', '打开源文件') as HTMLButtonElement).onclick = () => callbacks.onOpenSource(record);
}

function renderHeatmap(container: HTMLElement, heatmap: HeatmapDay[], todayDate: string, selectedDate: string, callbacks: OverviewCallbacks): void {
  const counts = new Map<string, number>();
  for (const day of heatmap) counts.set(day.date, day.count);
  const max = Math.max(1, ...heatmap.map((day) => day.count));

  appendDiv(container, 'oqm-section-label', '近 3 个月活动');

  // A single flat stream of small squares for the last ~3 months ending today.
  // Squares are not grouped by month; they wrap to fill the sidebar width.
  const grid = appendDiv(container, 'oqm-heatmap-grid');
  const end = parseDate(todayDate);
  const cursor = new Date(end);
  cursor.setDate(cursor.getDate() - 89); // 90 days inclusive

  while (cursor <= end) {
    const dateStr = formatDay(cursor);
    const count = counts.get(dateStr) ?? 0;
    const level = count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
    const isSelected = dateStr === selectedDate;
    const button = appendEl(grid, 'button', `oqm-heatmap-day oqm-heatmap-level-${level}${isSelected ? ' is-selected' : ''}`) as HTMLButtonElement;
    button.type = 'button';
    button.title = `${dateStr}：${count} 条`;
    button.setAttribute('aria-label', `${dateStr}，${count} 条记录`);
    button.onclick = () => callbacks.onSelectDate(dateStr);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function formatDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function typeLabel(type: QuickMemoType): string {
  return type === 'record' ? '记录' : type === 'flash' ? '闪念' : '待办';
}

const TYPE_OPTIONS: ReadonlyArray<readonly [QuickMemoType, string]> = [
  ['record', '记录'],
  ['flash', '闪念'],
  ['todo', '待办'],
];

/** Map the current view filters back to a composite select value. */
function filterValueFromState(filters: ViewFilters): TypeFilterValue {
  if (filters.type === 'todo' && filters.todoStatus === 'completed') return 'todo-done';
  if (filters.type === 'todo' && filters.todoStatus === 'open') return 'todo-open';
  return filters.type ?? 'all';
}

function appendDiv(parent: HTMLElement, cls: string, text?: string): HTMLDivElement {
  const el = appendEl(parent, 'div', cls, text) as HTMLDivElement;
  return el;
}

function appendEl<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

function appendOption(select: HTMLSelectElement, label: string, value: string): void {
  const option = document.createElement('option');
  option.textContent = label;
  option.value = value;
  select.appendChild(option);
}
