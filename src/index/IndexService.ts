import type { HeatmapDay, IndexQuery, ParseWarning, QuickMemoRecord } from '../types';
import type { VaultLike } from '../test/fakeVault';
import type { QuickMemoParser } from '../markdown/QuickMemoParser';
import { dateFromPath, isQuickMemoPath } from '../daily-notes/path';

export class IndexService {
  private records: QuickMemoRecord[] = [];
  private warningsList: ParseWarning[] = [];
  private mtimes = new Map<string, number>();

  constructor(
    private readonly vault: VaultLike,
    private readonly parser: QuickMemoParser,
  ) {}

  async rebuild(): Promise<void> {
    const next: QuickMemoRecord[] = [];
    const nextWarnings: ParseWarning[] = [];
    const nextMtimes = new Map<string, number>();

    for (const filePath of this.indexableMarkdownFiles()) {
      const content = await this.vault.read(filePath);
      const date = dateFromPath(filePath);
      const parsed = this.parser.parseFile(filePath, date, content);
      next.push(...parsed.records);
      nextWarnings.push(...parsed.warnings);
      nextMtimes.set(filePath, this.vault.stat(filePath)?.mtime ?? 0);
    }

    this.records = sortRecords(next, 'asc');
    this.warningsList = nextWarnings;
    this.mtimes = nextMtimes;
  }

  async refreshChangedFiles(): Promise<void> {
    const changed = this.indexableMarkdownFiles().filter((filePath) => this.vault.stat(filePath)?.mtime !== this.mtimes.get(filePath));
    if (changed.length === 0) return;

    const unchangedRecords = this.records.filter((record) => !changed.includes(record.filePath));
    const reparsed: QuickMemoRecord[] = [];
    const refreshedWarnings: ParseWarning[] = this.warningsList.filter((warning) => !changed.includes(warning.filePath));
    for (const filePath of changed) {
      const parsed = this.parser.parseFile(filePath, dateFromPath(filePath), await this.vault.read(filePath));
      reparsed.push(...parsed.records);
      refreshedWarnings.push(...parsed.warnings);
      this.mtimes.set(filePath, this.vault.stat(filePath)?.mtime ?? 0);
    }
    this.records = sortRecords([...unchangedRecords, ...reparsed], 'asc');
    this.warningsList = refreshedWarnings;
  }

  warnings(): ParseWarning[] {
    return this.warningsList;
  }

  query(query: IndexQuery): QuickMemoRecord[] {
    const text = query.text?.trim().toLowerCase();
    return this.records.filter((record) => {
      if (query.startDate && record.date < query.startDate) return false;
      if (query.endDate && record.date > query.endDate) return false;
      if (query.types?.length && !query.types.includes(record.type)) return false;
      if (query.completed !== undefined && record.completed !== query.completed) return false;
      if (query.tags?.length && !query.tags.every((tag) => record.tags.includes(tag))) return false;
      if (text) {
        const haystack = `${record.content}\n${record.body ?? ''}\n${record.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    });
  }

  heatmap(): HeatmapDay[] {
    const counts = new Map<string, number>();
    for (const record of this.records) {
      counts.set(record.date, (counts.get(record.date) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }

  tags(): Array<[string, number]> {
    const counts = new Map<string, number>();
    for (const record of this.records) {
      for (const tag of record.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  private indexableMarkdownFiles(): string[] {
    return this.vault.listMarkdownFiles().filter(isQuickMemoPath);
  }
}

function sortRecords(records: QuickMemoRecord[], direction: 'asc' | 'desc'): QuickMemoRecord[] {
  return [...records].sort((a, b) => {
    const result = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    return direction === 'asc' ? result : -result;
  });
}
