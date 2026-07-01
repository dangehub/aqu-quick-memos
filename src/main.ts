import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_QUICK_MEMO } from './constants';
import { DailyNoteResolver } from './daily-notes/DailyNoteResolver';
import { getDailyNotesConfig } from './daily-notes/obsidianInternal';
import { IndexService } from './index/IndexService';
import { MarkdownRecordRepository } from './markdown/MarkdownRecordRepository';
import { QuickMemoParser } from './markdown/QuickMemoParser';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings/settings';
import { QuickMemoSettingTab } from './settings/SettingsTab';
import type { QuickMemoSettings } from './types';
import { shouldHandleVaultFileEvent } from './vaultEvents';
import { QuickMemoView } from './view/QuickMemoView';

class ObsidianVaultAdapter {
  constructor(private readonly plugin: Plugin) {}

  async read(path: string): Promise<string> {
    const file = this.getFile(path);
    return this.plugin.app.vault.read(file);
  }

  async modify(path: string, content: string): Promise<void> {
    const file = this.getFile(path);
    await this.plugin.app.vault.modify(file, content);
  }

  async create(path: string, content: string): Promise<void> {
    await this.plugin.app.vault.create(path, content);
  }

  exists(path: string): boolean {
    return this.plugin.app.vault.getAbstractFileByPath(path) instanceof TFile;
  }

  listMarkdownFiles(): string[] {
    return this.plugin.app.vault.getMarkdownFiles().map((file) => file.path);
  }

  stat(path: string): { mtime: number } | undefined {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? { mtime: file.stat.mtime } : undefined;
  }

  private getFile(path: string): TFile {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
    return file;
  }
}

export default class QuickMemoPlugin extends Plugin {
  settings: QuickMemoSettings = DEFAULT_SETTINGS;
  private index!: IndexService;
  private refreshTimer: number | undefined;
  private rebuildTimer: number | undefined;

  async onload(): Promise<void> {
    await this.loadSettings();

    const vault = new ObsidianVaultAdapter(this);
    const parser = new QuickMemoParser(() => this.settings.quickMemoHeading);
    const resolver = new DailyNoteResolver(vault, getDailyNotesConfig(this.app), this.settings, momentFormatter());
    const repository = new MarkdownRecordRepository(vault, resolver, parser, this.settings);
    this.index = new IndexService(vault, parser, () => this.settings.parseMode);

    this.registerView(VIEW_TYPE_QUICK_MEMO, (leaf) => new QuickMemoView(leaf, this.settings, repository, this.index, resolver, () => this.saveSettings()));

    this.addRibbonIcon('notebook-pen', 'Open Quick Memo', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-quick-memo-overview',
      name: 'Open overview',
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: 'rebuild-quick-memo-index',
      name: 'Rebuild index',
      callback: () => {
        void this.index.rebuild().then(() => new Notice('Quick Memo 索引已重建'));
      },
    });

    this.addCommand({
      id: 'backfill-current-day-quick-memo-ids',
      name: 'Backfill missing block IDs for today',
      callback: () => {
        void (async () => {
          const count = await repository.backfillMissingIds(localToday());
          await this.index.rebuild();
          new Notice(`已补全 ${count} 条 Quick Memo ID`);
        })();
      },
    });

    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (file instanceof TFile && shouldHandleVaultFileEvent(file.path)) this.scheduleRefreshChangedFiles();
    }));
    this.registerEvent(this.app.vault.on('create', (file) => {
      if (file instanceof TFile && shouldHandleVaultFileEvent(file.path)) this.scheduleRefreshChangedFiles();
    }));
    // Deleted Quick Memo files must drop their records from the cache; a delta
    // refresh can't detect removals, so coalesce deletes into one rebuild.
    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (file instanceof TFile && shouldHandleVaultFileEvent(file.path)) this.scheduleRebuild();
    }));

    this.addSettingTab(new QuickMemoSettingTab(this.app, this));

    // Optionally auto-open in the main content area on plugin load.
    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateView();
      });
    }
  }

  onunload(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    if (this.rebuildTimer !== undefined) window.clearTimeout(this.rebuildTimer);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    // Reuse an existing Quick Memo leaf if one is open, so we don't reset a leaf
    // the user may have moved.
    const existing = workspace.getLeavesOfType(VIEW_TYPE_QUICK_MEMO)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }
    // Open in the main content area as a tab (works on both desktop & mobile).
    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_QUICK_MEMO, active: true });
    await workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Settings that affect parsing/resolution (heading, folders, date format)
    // must rebuild the index and refresh any open overview so changes take effect.
    await this.index.rebuild();
    this.refreshOverview();
  }

  private scheduleRefreshChangedFiles(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      void this.index.refreshChangedFiles().then(() => this.refreshOverview());
    }, 500);
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer !== undefined) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = undefined;
      void this.index.rebuild().then(() => this.refreshOverview());
    }, 500);
  }

  private refreshOverview(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QUICK_MEMO)) {
      const view = leaf.view;
      if (view instanceof QuickMemoView) void view.refresh();
    }
  }
}

/** Format a YYYY-MM-DD date using Obsidian's moment, matching the user's Daily Notes config exactly. */
function momentFormatter(): (date: string, format: string) => string {
  const momentFn = (window as unknown as { moment?: (inp: string) => { format(f: string): string } }).moment;
  if (typeof momentFn === 'function') {
    return (date, format) => momentFn(date).format(format);
  }
  return (date, format) => simpleFormatDate(date, format);
}

function simpleFormatDate(date: string, format: string): string {
  const [year, month, day] = date.split('-');
  return format.replace(/YYYY/gu, year).replace(/MM/gu, month).replace(/DD/gu, day);
}

function localToday(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
