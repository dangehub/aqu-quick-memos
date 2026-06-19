import { Component, ItemView, MarkdownRenderer, Menu, Notice, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_QUICK_MEMO } from '../constants';
import type { QuickMemoRecord, QuickMemoSettings, QuickMemoType } from '../types';
import type { IndexService } from '../index/IndexService';
import type { MarkdownRecordRepository } from '../markdown/MarkdownRecordRepository';
import { randomIdSuffix } from '../markdown/id';
import { filterRecordsForView, rollSelectedDate, sortRecordsForDisplay, type ViewFilters } from './viewState';
import { renderOverview, recordKey } from './render';

export class QuickMemoView extends ItemView {
  private selectedDate = today();
  private currentDay = today();
  private filters: ViewFilters = {};
  private editingRecordId: string | undefined;
  private openMenuRecordId: string | undefined;
  private dayWatcher: number | undefined;
  /** Child components created by MarkdownRenderer during a render; unloaded on
   *  the next full re-render so the live markdown rendering doesn't leak. */
  private renderChildren: Component[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private readonly settings: QuickMemoSettings,
    private readonly repository: MarkdownRecordRepository,
    private readonly index: IndexService,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_QUICK_MEMO;
  }

  getDisplayText(): string {
    return 'Quick Memo';
  }

  async onOpen(): Promise<void> {
    this.currentDay = today();
    this.render();
    void this.rebuildIndexInBackground();
    // Check once a minute for a local-day rollover while the view stays open.
    this.dayWatcher = window.setInterval(() => this.checkDayRollover(), 60_000);
    // Close an open record menu on the next tap/click anywhere outside it.
    document.addEventListener('pointerdown', this.handleOutsideInteraction, true);
  }

  async onClose(): Promise<void> {
    if (this.dayWatcher !== undefined) {
      window.clearInterval(this.dayWatcher);
      this.dayWatcher = undefined;
    }
    document.removeEventListener('pointerdown', this.handleOutsideInteraction, true);
  }

  /**
   * Capture-phase pointerdown fires before a card's own click handlers, which is
   * essential here: those handlers re-render the DOM and detach the original event
   * target, so a later-phase listener couldn't recognise it. If a menu is open and
   * the press is outside the menu or its trigger, close the menu.
   */
  private handleOutsideInteraction = (event: PointerEvent): void => {
    if (this.openMenuRecordId === undefined) return;
    const target = event.target;
    if (target instanceof Element && (target.closest('.oqm-record-menu') || target.closest('.oqm-record-menu-trigger'))) {
      return;
    }
    this.openMenuRecordId = undefined;
    this.render();
  };

  async refresh(): Promise<void> {
    try {
      await this.index.refreshChangedFiles();
      this.notifyWarnings();
      this.render();
    } catch (error) {
      this.showFatalError(error);
    }
  }

  private async rebuildIndexInBackground(): Promise<void> {
    try {
      await this.index.rebuild();
      this.notifyWarnings();
      this.render();
    } catch (error) {
      this.showFatalError(error);
    }
  }

  private checkDayRollover(): void {
    const now = today();
    const next = rollSelectedDate(this.selectedDate, this.currentDay, now);
    this.currentDay = now;
    if (next !== undefined) {
      this.selectedDate = next;
      this.render();
    }
  }

  private notifyWarnings(): void {
    const n = this.index.warnings().length;
    if (n > 0) {
      new Notice(`Quick Memo 解析到 ${n} 条格式冲突，请检查对应 Daily Note。`);
    }
  }

  private showFatalError(error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    this.contentEl.empty();
    this.contentEl.addClass('oqm-root');
    const box = this.contentEl.createDiv({ cls: 'oqm-fatal-error' });
    box.createEl('h3', { text: 'Quick Memo 打开失败' });
    box.createEl('p', { text: message });
    new Notice(`Quick Memo 打开失败：${message}`);
  }

  private render(): void {
    // Tear down the previous render's markdown child components before rebuilding.
    for (const child of this.renderChildren) {
      try {
        child.unload();
      } catch {
        /* already disposed */
      }
    }
    this.renderChildren = [];

    // Snapshot the focused text field so the full re-render can restore its focus
    // and caret — otherwise rebuilding the DOM on each search keystroke drops it.
    const restoreFocus = captureFocusRestore(this.contentEl);

    const allRecords = this.index.query({});
    const filtered = filterRecordsForView(allRecords, { ...this.filters, selectedDate: this.selectedDate });
    const records = sortRecordsForDisplay(filtered, this.settings.sortDirection);
    renderOverview(this.contentEl, {
      settings: this.settings,
      records,
      tags: this.index.tags(),
      heatmap: this.index.heatmap(),
      selectedDate: this.selectedDate,
      todayDate: today(),
      editingRecordId: this.editingRecordId,
      openMenuRecordId: this.openMenuRecordId,
      filters: this.filters,
      markdown: {
        render: (source, el) => {
          const component = new Component();
          component.load();
          void MarkdownRenderer.render(this.app, source, el, '', component);
          this.renderChildren.push(component);
        },
      },
    }, {
      onSave: (draft) => void this.saveDraft(draft),
      onSelectDate: (date) => {
        this.selectedDate = date;
        this.render();
      },
      onToggleTodo: (record) => {
        this.openMenuRecordId = undefined;
        void this.toggleTodo(record);
      },
      onEdit: (record) => {
        this.openMenuRecordId = undefined;
        this.editingRecordId = recordKey(record);
        this.render();
      },
      onSaveEdit: (record, changes) => void this.saveEdit(record, changes),
      onCancelEdit: () => {
        this.editingRecordId = undefined;
        this.render();
      },
      onDelete: (record) => {
        this.openMenuRecordId = undefined;
        void this.deleteRecord(record);
      },
      onCopyBlock: (record) => {
        this.openMenuRecordId = undefined;
        this.copyBlock(record);
        this.render();
      },
      onOpenSource: (record) => {
        this.openMenuRecordId = undefined;
        void this.openSource(record);
      },
      onFilterChange: (filters) => {
        const next = { ...this.filters, ...filters };
        // Skip when the keyword text is unchanged — this also prevents the blur
        // event fired during our own DOM teardown from re-triggering a search.
        if ('text' in filters && (next.text ?? '') === (this.filters.text ?? '')) return;
        this.filters = next;
        this.render();
      },
      onToggleMenu: (recordId) => {
        this.openMenuRecordId = this.openMenuRecordId === recordId ? undefined : recordId;
        this.render();
      },
      onTagContext: (tag, event) => {
        const menu = new Menu();
        menu.addItem((item) => item.setTitle('删除标签').setIcon('trash').onClick(() => void this.deleteTag(tag)));
        menu.showAtMouseEvent(event);
      },
    });

    restoreFocus?.();
  }

  private async deleteTag(tag: string): Promise<void> {
    const confirmed = window.confirm(`从所有 Quick Memo 记录中移除标签 ${tag}？\n此操作会修改包含该标签的 Daily Note 文件。`);
    if (!confirmed) return;
    const count = await this.repository.removeTag(tag);
    await this.index.rebuild();
    this.render();
    new Notice(count > 0 ? `已从 ${count} 条记录中移除 ${tag}` : `没有记录包含标签 ${tag}（已刷新列表）`);
  }

  private async saveDraft(draft: { type: QuickMemoType; content: string }): Promise<void> {
    const [content, ...bodyLines] = draft.content.replace(/\r\n/gu, '\n').split('\n');
    await this.repository.appendRecord({
      date: this.selectedDate,
      time: currentTime(),
      type: draft.type,
      content,
      body: bodyLines.join('\n') || undefined,
      completed: draft.type === 'todo' ? false : undefined,
    }, randomIdSuffix());
    await this.index.rebuild();
    this.render();
  }

  private async toggleTodo(record: QuickMemoRecord): Promise<void> {
    if (!record.id) {
      new Notice('该记录缺少块 ID，请先补全 ID 后再勾选。');
      this.render();
      return;
    }
    await this.repository.toggleTodo(record.id);
    await this.index.rebuild();
    this.render();
  }

  private async saveEdit(record: QuickMemoRecord, changes: { type: QuickMemoType; content: string; body?: string }): Promise<void> {
    if (!record.id) {
      new Notice('该记录缺少块 ID，请先补全 ID 后再编辑。');
      return;
    }
    await this.repository.updateRecord(record.id, changes);
    this.editingRecordId = undefined;
    await this.index.rebuild();
    this.render();
  }

  private async deleteRecord(record: QuickMemoRecord): Promise<void> {
    if (!record.id) {
      new Notice('该记录缺少块 ID，请先补全 ID 后再删除。');
      return;
    }
    const confirmed = window.confirm('删除这条 Quick Memo？此操作会修改 Daily Note 文件。');
    if (!confirmed) return;
    await this.repository.deleteRecord(record.id);
    await this.index.rebuild();
    this.render();
  }

  private copyBlock(record: QuickMemoRecord): void {
    if (!record.id) {
      new Notice('该记录缺少块 ID，无法复制块链接。');
      return;
    }
    const link = `[[${record.filePath.replace(/\.md$/u, '')}#^${record.id}]]`;
    void navigator.clipboard.writeText(link);
    new Notice('已复制块链接');
  }

  private async openSource(record: QuickMemoRecord): Promise<void> {
    await this.app.workspace.openLinkText(record.filePath, '', false);
  }
}

function today(): string {
  return localDateString(new Date());
}

function currentTime(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function localDateString(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Snapshot the focused text field inside `scope` (one of our live inputs) so a
 * full re-render can restore its focus and caret afterwards. Without this,
 * rebuilding the DOM on every search keystroke discards the field mid-type.
 */
function captureFocusRestore(scope: HTMLElement): (() => void) | undefined {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return undefined;
  if (!scope.contains(el)) return undefined;
  const selector = el.classList.contains('oqm-search') ? '.oqm-search'
    : el.classList.contains('oqm-edit-input') ? '.oqm-edit-input'
    : el.classList.contains('oqm-input') ? '.oqm-input'
    : '';
  if (!selector) return undefined;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  return () => {
    const next = scope.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!next) return;
    next.focus();
    try {
      next.setSelectionRange(start, end);
    } catch {
      /* some input types don't support setSelectionRange */
    }
  };
}
