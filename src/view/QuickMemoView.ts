import { App, Component, ItemView, MarkdownRenderer, Menu, Modal, Notice, Platform, Setting, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_OH_MY_MEMO } from '../constants';
import type { QuickMemoRecord, QuickMemoSettings, QuickMemoType } from '../types';
import type { IndexService } from '../index/IndexService';
import type { MarkdownRecordRepository } from '../markdown/MarkdownRecordRepository';
import type { DailyNoteResolver } from '../daily-notes/DailyNoteResolver';
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
  /** Directory of the currently selected date's memo file — set during render,
   *  used by formatAttachmentLink for relative-path computation. */
  private currentMemoDir = '';
  private sidebarCollapsed = false;
  /** `'all'` = show records across all dates; `'date'` = filter to selectedDate;
   *  `'range'` = filter to dateRange. */
  private viewMode: 'all' | 'date' | 'range' = 'all';
  /** Date range filter (inclusive). Only used when viewMode === 'range'. */
  private dateRange: { start: string; end: string } | null = null;
  /** Number of records currently visible (lazy load). */
  private visibleCount = 50;
  /** Child components created by MarkdownRenderer during a render; unloaded on
   *  the next full re-render so the live markdown rendering doesn't leak. */
  private renderChildren: Component[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private readonly settings: QuickMemoSettings,
    private readonly repository: MarkdownRecordRepository,
    private readonly index: IndexService,
    private readonly resolver: DailyNoteResolver,
    private readonly saveSettings: () => Promise<void>,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_OH_MY_MEMO;
  }

  getDisplayText(): string {
    return 'OhMyMemo';
  }

  async onOpen(): Promise<void> {
    this.currentDay = today();
    // Prevent the Obsidian mobile toolbar from covering the bottom of the view.
    if (Platform.isMobile) {
      this.contentEl.style.paddingBottom = '80px';
    }
    this.render();
    void this.rebuildIndexInBackground();
    // Check once a minute for a local-day rollover while the view stays open.
    this.dayWatcher = window.setInterval(() => this.checkDayRollover(), 60_000);
    // Close an open record menu on the next tap/click anywhere outside it.
    activeDocument.addEventListener('pointerdown', this.handleOutsideInteraction, true);
  }

  async onClose(): Promise<void> {
    if (this.dayWatcher !== undefined) {
      window.clearInterval(this.dayWatcher);
      this.dayWatcher = undefined;
    }
    activeDocument.removeEventListener('pointerdown', this.handleOutsideInteraction, true);
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
    if (target instanceof Element && (target.closest('.omm-record-menu') || target.closest('.omm-record-menu-trigger'))) {
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
    // Warnings are shown inline in the sidebar — no intrusive notice.
  }

  private showFatalError(error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    this.contentEl.empty();
    this.contentEl.addClass('omm-root');
    const box = this.contentEl.createDiv({ cls: 'omm-fatal-error' });
    box.createEl('h3', { text: 'OhMyMemo 打开失败' });
    box.createEl('p', { text: message });
    new Notice(`OhMyMemo 打开失败：${message}`);
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

    // Cache the memo file directory for link formatting (used by paste handler).
    void this.resolver.resolve(this.selectedDate).then((r) => {
      const lastSlash = r.filePath.lastIndexOf('/');
      this.currentMemoDir = lastSlash >= 0 ? r.filePath.substring(0, lastSlash) : '';
    });

    // Snapshot the focused text field so the full re-render can restore its focus
    // and caret — otherwise rebuilding the DOM on each search keystroke drops it.
    const restoreFocus = captureFocusRestore(this.contentEl);

    const allRecords = this.index.query({});
    let dateFilter: Partial<ViewFilters> = {};
    if (this.viewMode === 'date') {
      dateFilter = { selectedDate: this.selectedDate };
    } else if (this.viewMode === 'range' && this.dateRange) {
      dateFilter = { dateStart: this.dateRange.start, dateEnd: this.dateRange.end };
    }
    const filtered = filterRecordsForView(allRecords, { ...this.filters, ...dateFilter });
    const records = sortRecordsForDisplay(filtered, this.settings.sortDirection);
    const hasMore = records.length > this.visibleCount;
    const visible = records.slice(0, this.visibleCount);
    renderOverview(this.contentEl, {
      settings: this.settings,
      records: visible,
      recordsTotal: records.length,
      tags: this.index.tags(),
      heatmap: this.index.heatmap(),
      selectedDate: this.selectedDate,
      todayDate: today(),
      editingRecordId: this.editingRecordId,
      openMenuRecordId: this.openMenuRecordId,
      filters: this.filters,
      stats: computeStats(allRecords),
      warningCount: this.index.warnings().length,
      sortDirection: this.settings.sortDirection,
      sidebarCollapsed: this.sidebarCollapsed,
      viewMode: this.viewMode,
      dateRangeStart: this.dateRange?.start,
      dateRangeEnd: this.dateRange?.end,
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
        this.viewMode = 'date';
        this.dateRange = null;
        this.visibleCount = 50;
        this.sidebarCollapsed = true;
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
      onToggleSidebar: () => {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.render();
      },
      onToggleSort: () => {
        this.settings.sortDirection = this.settings.sortDirection === 'asc' ? 'desc' : 'asc';
        void this.saveSettings();
        this.render();
      },
      onLoadMore: () => {
        this.visibleCount += 50;
        this.render();
      },
      onShowAll: () => {
        this.viewMode = 'all';
        this.dateRange = null;
        this.visibleCount = 50;
        this.render();
      },
      onApplyDateRange: (start, end) => {
        this.viewMode = 'range';
        this.dateRange = { start, end };
        this.visibleCount = 50;
        this.sidebarCollapsed = true;
        this.render();
      },
      onHeatmapPrevMonth: () => {
        const [y, m] = this.selectedDate.split('-').map(Number);
        const prev = new Date(y, m - 2, 1);
        const mo = String(prev.getMonth() + 1).padStart(2, '0');
        this.selectedDate = `${prev.getFullYear()}-${mo}-01`;
        this.render();
      },
      onHeatmapNextMonth: () => {
        const [y, m] = this.selectedDate.split('-').map(Number);
        const next = new Date(y, m, 1);
        const mo = String(next.getMonth() + 1).padStart(2, '0');
        this.selectedDate = `${next.getFullYear()}-${mo}-01`;
        this.render();
      },
      onAttachFile: (file, textarea) => {
        void this.attachImage(file, textarea);
      },
    });

    restoreFocus?.();

    // If a record's action menu is open, make sure it isn't clipped by the bottom
    // of the viewport — scroll it into view on the next frame (after the DOM is
    // laid out). `block: 'nearest'` only scrolls when the menu is off-screen, so
    // middle-of-list cards don't jump.
    if (this.openMenuRecordId !== undefined) {
      window.requestAnimationFrame(() => {
        const menu = this.contentEl.querySelector<HTMLElement>('.omm-record-menu');
        menu?.scrollIntoView({ block: 'nearest' });
      });
    }

    // Attach paste handler for image attachments
    const input = this.contentEl.querySelector<HTMLTextAreaElement>('.omm-input');
    if (input) input.addEventListener('paste', this.handlePaste);
  }

  private handlePaste = async (event: ClipboardEvent): Promise<void> => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        try {
          const fullPath = await this.saveAttachment(file);
          const link = this.formatAttachmentLink(fullPath);
          const textarea = event.target as HTMLTextAreaElement;
          this.insertAtCursor(textarea, link);
        } catch (err) {
          new Notice('附件保存失败');
          console.error('OhMyMemo attachment save failed:', err);
        }
      }
    }
  };

  private async saveAttachment(file: File): Promise<string> {
    const resolution = await this.resolver.resolve(this.selectedDate);
    const dir = this.getAttachmentDir(resolution.filePath);
    const adapter = this.app.vault.adapter;

    if (dir && !(await adapter.exists(dir))) {
      await adapter.mkdir(dir);
    }

    const ext = file.name.split('.').pop() ?? 'png';
    const filename = `memo-${Date.now()}.${ext}`;
    const fullPath = dir ? `${dir}/${filename}` : filename;

    const arrayBuf = await file.arrayBuffer();
    await adapter.writeBinary(fullPath, arrayBuf);

    return fullPath;
  }

  private getAttachmentDir(memoFilePath: string): string {
    const { settings } = this;
    const parentDir = memoFilePath.substring(0, memoFilePath.lastIndexOf('/'));

    switch (settings.attachmentFolderMode) {
      case 'obsidianDefault': return this.getObsidianAttachmentDir(memoFilePath);
      case 'root': return '';
      case 'sameFolder': return parentDir;
      case 'subFolder': return `${parentDir}/${settings.attachmentSubFolder}`;
      case 'customFolder': return settings.customAttachmentFolder;
    }
  }

  /** Follow Obsidian's global Files & Links → Attachment folder path setting. */
  private getObsidianAttachmentDir(memoFilePath: string): string {
    // getConfig is a runtime method on Vault but not in the public type declarations.
    const configPath = (this.app.vault as unknown as { getConfig(key: string): string }).getConfig('attachmentFolderPath');
    // Obsidian config values: './' = same folder; './foo' = subfolder; 'foo/' = vault-root folder
    if (!configPath || configPath === './' || configPath === '.') {
      // Same folder as the memo file
      return memoFilePath.substring(0, memoFilePath.lastIndexOf('/'));
    }
    if (configPath.startsWith('./')) {
      // Subfolder relative to the memo file
      const subFolder = configPath.slice(2);
      const parentDir = memoFilePath.substring(0, memoFilePath.lastIndexOf('/'));
      return parentDir ? `${parentDir}/${subFolder}` : subFolder;
    }
    // Vault-root-relative folder (strip trailing slash if any)
    return configPath.replace(/\/$/u, '');
  }

  /** Format an attachment's vault path as a wiki `![[...]]` or markdown `![](...)` link
   *  according to the plugin's link settings (or Obsidian's global settings). */
  private formatAttachmentLink(fullPath: string): string {
    const style = this.resolveLinkStyle();
    const displayPath = this.formatLinkPath(fullPath);
    if (style === 'markdown') {
      const name = fullPath.split('/').pop() ?? fullPath;
      return `![${name}](${displayPath})`;
    }
    // wiki — Obsidian translates embedded wiki images with `!` prefix
    return `![[${displayPath}]]`;
  }

  /** Resolve link style (wiki vs markdown) from plugin or Obsidian global settings. */
  private resolveLinkStyle(): 'wiki' | 'markdown' {
    const { settings } = this;
    if (settings.linkStyle === 'obsidianDefault') {
      const useMarkdown = (this.app.vault as unknown as { getConfig(k: string): unknown }).getConfig('useMarkdownLinks');
      return useMarkdown ? 'markdown' : 'wiki';
    }
    return settings.linkStyle;
  }

  /** Format the display path for a link according to path format settings. */
  private formatLinkPath(fullPath: string): string {
    const format = this.resolveLinkPathFormat();
    const memoDir = this.getMemoFileDir();
    switch (format) {
      case 'shortest':
        return fullPath.split('/').pop() ?? fullPath;
      case 'relative': {
        if (!memoDir) return fullPath;
        const fromParts = memoDir.split('/').filter(Boolean);
        const toParts = fullPath.split('/').filter(Boolean);
        // Remove common prefix
        let i = 0;
        while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
        const up = fromParts.length - i;
        const rel = [...Array(up).fill('..'), ...toParts.slice(i)];
        return rel.join('/');
      }
      case 'absolute':
      default:
        return fullPath;
    }
  }

  /** Resolve path format (shortest/relative/absolute) from plugin or Obsidian global settings. */
  private resolveLinkPathFormat(): 'shortest' | 'relative' | 'absolute' {
    const { settings } = this;
    if (settings.linkPathFormat === 'obsidianDefault') {
      const format = (this.app.vault as unknown as { getConfig(k: string): unknown }).getConfig('newLinkFormat') as string;
      if (format === 'relative') return 'relative';
      if (format === 'absolute') return 'absolute';
      return 'shortest';
    }
    return settings.linkPathFormat;
  }

  /** Get the directory of the currently selected memo file for relative path computation. */
  private getMemoFileDir(): string {
    return this.currentMemoDir;
  }

  private insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  private async deleteTag(tag: string): Promise<void> {
    const confirmed = await confirmDialog(this.app, '删除标签', `从所有 OhMyMemo 记录中移除标签 ${tag}？\n此操作会修改包含该标签的 Daily Note 文件。`);
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
    const confirmed = await confirmDialog(this.app, '删除记录', '删除这条 OhMyMemo？此操作会修改 Daily Note 文件。');
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
    // Extract just the filename without .md extension (e.g. "2026-07-01" from "每日工作/2026/07/2026-07-01.md")
    const basename = record.filePath.split('/').pop()?.replace(/\.md$/u, '') ?? record.filePath;
    const link = `![[${basename}#^${record.id}]]`;
    void navigator.clipboard.writeText(link);
    new Notice('已复制块链接');
  }

  private async openSource(record: QuickMemoRecord): Promise<void> {
    await this.app.workspace.openLinkText(record.filePath, '', false);
  }

  private async attachImage(file: File, textarea: HTMLTextAreaElement): Promise<void> {
    try {
      const fullPath = await this.saveAttachment(file);
      const link = this.formatAttachmentLink(fullPath);
      this.insertAtCursor(textarea, link);
    } catch (err) {
      console.error('[QuickMemo] attachImage failed:', err);
      new Notice(`插入图片失败：${err instanceof Error ? err.message : String(err)}`);
    }
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

/** Reduce the full record set into the global stats shown under the heatmap. */
function computeStats(records: QuickMemoRecord[]): { days: number; total: number; memo: number; todo: number; todoDone: number } {
  const days = new Set<string>();
  let memo = 0;
  let todo = 0;
  let todoDone = 0;
  for (const r of records) {
    days.add(r.date);
    if (r.type === 'todo') {
      todo += 1;
      if (r.completed) todoDone += 1;
    } else {
      memo += 1;
    }
  }
  return { days: days.size, total: records.length, memo, todo, todoDone };
}

/**
 * Snapshot the focused text field inside `scope` (one of our live inputs) so a
 * full re-render can restore its focus and caret afterwards. Without this,
 * rebuilding the DOM on every search keystroke discards the field mid-type.
 */
function captureFocusRestore(scope: HTMLElement): (() => void) | undefined {
  const el = activeDocument.activeElement;
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return undefined;
  if (!scope.contains(el)) return undefined;
  const selector = el.classList.contains('omm-search') ? '.omm-search'
    : el.classList.contains('omm-edit-input') ? '.omm-edit-input'
    : el.classList.contains('omm-input') ? '.omm-input'
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

/** A Modal-based confirmation dialog — replaces window.confirm, which Obsidian
 *  discourages. Resolves true on confirm, false on cancel. */
function confirmDialog(app: App, title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.setTitle(title);
    modal.setContent(message);
    let result = false;
    new Setting(modal.contentEl)
      .addButton((button) => button
        .setButtonText('确认')
        .setCta()
        .onClick(() => {
          result = true;
          modal.close();
        }))
      .addButton((button) => button
        .setButtonText('取消')
        .onClick(() => modal.close()));
    modal.onClose = () => resolve(result);
    modal.open();
  });
}
