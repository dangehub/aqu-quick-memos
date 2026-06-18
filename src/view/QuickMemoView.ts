import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_QUICK_MEMO } from '../constants';
import type { QuickMemoRecord, QuickMemoSettings, QuickMemoType } from '../types';
import type { IndexService } from '../index/IndexService';
import type { MarkdownRecordRepository } from '../markdown/MarkdownRecordRepository';
import { randomIdSuffix } from '../markdown/id';
import { filterRecordsForView, rollSelectedDate, sortRecordsForDisplay, type ViewFilters } from './viewState';
import { renderOverview } from './render';

export class QuickMemoView extends ItemView {
  private selectedDate = today();
  private currentDay = today();
  private filters: ViewFilters = {};
  private editingRecordId: string | undefined;
  private dayWatcher: number | undefined;

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
    await this.index.rebuild();
    this.notifyWarnings();
    this.render();
    // Check once a minute for a local-day rollover while the view stays open.
    this.dayWatcher = window.setInterval(() => this.checkDayRollover(), 60_000);
  }

  async onClose(): Promise<void> {
    if (this.dayWatcher !== undefined) {
      window.clearInterval(this.dayWatcher);
      this.dayWatcher = undefined;
    }
  }

  async refresh(): Promise<void> {
    await this.index.refreshChangedFiles();
    this.notifyWarnings();
    this.render();
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

  private render(): void {
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
      filters: this.filters,
    }, {
      onSave: (draft) => void this.saveDraft(draft),
      onSelectDate: (date) => {
        this.selectedDate = date;
        this.render();
      },
      onToggleTodo: (record) => void this.toggleTodo(record),
      onEdit: (record) => {
        this.editingRecordId = record.id;
        this.render();
      },
      onSaveEdit: (record, changes) => void this.saveEdit(record, changes),
      onCancelEdit: () => {
        this.editingRecordId = undefined;
        this.render();
      },
      onDelete: (record) => void this.deleteRecord(record),
      onCopyBlock: (record) => this.copyBlock(record),
      onOpenSource: (record) => void this.openSource(record),
      onFilterChange: (filters) => {
        this.filters = { ...this.filters, ...filters };
        this.render();
      },
    });
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
