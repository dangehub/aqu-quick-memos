import type { QuickMemoRecord, QuickMemoSettings, QuickMemoType, RecordDraft } from '../types';
import type { VaultLike } from '../test/fakeVault';
import type { DailyNoteResolver } from '../daily-notes/DailyNoteResolver';
import type { QuickMemoParser } from './QuickMemoParser';
import { createBlockId } from './id';
import { dateFromPath, isQuickMemoPath } from '../daily-notes/path';
import { headingEndPattern, headingLinePattern } from '../daily-notes/DailyNoteResolver';

export class MarkdownRecordRepository {
  constructor(
    private readonly vault: VaultLike,
    private readonly resolver: DailyNoteResolver,
    private readonly parser: QuickMemoParser,
    private readonly settings: QuickMemoSettings,
  ) {}

  async appendRecord(draft: RecordDraft, idSuffix: string): Promise<QuickMemoRecord> {
    const filePath = await this.resolver.ensureDailyNote(draft.date);
    const content = await this.vault.read(filePath);
    const id = this.settings.enableBlockIds ? createBlockId(draft.date, draft.time, idSuffix) : undefined;
    const serialized = this.parser.serializeRecord(draft, id);
    const updated = this.settings.insertMode === 'end'
      ? insertAtEnd(content, serialized)
      : insertIntoSection(content, this.settings.quickMemoHeading, serialized);
    await this.vault.modify(filePath, updated);
    const parsed = this.parser.parseFile(filePath, draft.date, updated, this.settings.parseMode).records;
    if (id) {
      const matched = parsed.find((record) => record.id === id);
      if (matched) return matched;
    }
    return parsed[parsed.length - 1];
  }

  async readRecords(date: string): Promise<QuickMemoRecord[]> {
    const resolution = await this.resolver.resolve(date);
    if (!this.vault.exists(resolution.filePath)) return [];
    const content = await this.vault.read(resolution.filePath);
    return this.parser.parseFile(resolution.filePath, date, content, this.settings.parseMode).records;
  }

  async updateRecord(id: string, changes: { type?: QuickMemoType; content?: string; body?: string; completed?: boolean }): Promise<void> {
    const located = await this.locateById(id);
    const nextDraft: RecordDraft = {
      date: located.record.date,
      time: located.record.time,
      type: changes.type ?? located.record.type,
      content: changes.content ?? located.record.content,
      body: changes.body ?? located.record.body,
      completed: changes.completed ?? located.record.completed,
    };
    const replacement = this.parser.serializeRecord(nextDraft, located.record.id);
    await this.replaceLines(located.filePath, located.record.lineStart, located.record.lineEnd, replacement);
  }

  async toggleTodo(id: string): Promise<void> {
    const located = await this.locateById(id);
    if (located.record.type !== 'todo') throw new Error(`Record is not a todo: ${id}`);
    await this.updateRecord(id, { completed: !located.record.completed });
  }

  async deleteRecord(id: string): Promise<void> {
    const located = await this.locateById(id);
    await this.replaceLines(located.filePath, located.record.lineStart, located.record.lineEnd, '');
  }

  /** Remove `tag` (e.g. "#project") from every record that uses it, rewriting each
   *  affected Daily Note in place. Returns the number of records changed. A rebuild
   *  afterwards also drops any stale records left over from deleted files. */
  async removeTag(tag: string): Promise<number> {
    let count = 0;
    for (const filePath of this.quickMemoFiles()) {
      let content = await this.vault.read(filePath);
      const date = dateFromPath(filePath);
      const records = this.parser.parseFile(filePath, date, content, this.settings.parseMode).records.filter((record) => record.tags.includes(tag));
      if (records.length === 0) continue;
      // Replace bottom-up so earlier line numbers stay valid as we mutate the text.
      for (const record of records.sort((a, b) => b.lineStart - a.lineStart)) {
        const replacement = this.parser.serializeRecord({
          date: record.date,
          time: record.time,
          type: record.type,
          content: stripTag(record.content, tag),
          body: record.body ? stripTag(record.body, tag) : undefined,
          completed: record.completed,
        }, record.id);
        content = replaceRange(content, record.lineStart, record.lineEnd, replacement);
        count += 1;
      }
      await this.vault.modify(filePath, content);
    }
    return count;
  }

  async backfillMissingIds(date: string): Promise<number> {
    const resolution = await this.resolver.resolve(date);
    if (!this.vault.exists(resolution.filePath)) return 0;
    let content = await this.vault.read(resolution.filePath);
    const records = this.parser.parseFile(resolution.filePath, date, content, this.settings.parseMode).records.filter((record) => !record.id);
    let count = 0;
    for (const record of records) {
      const id = createBlockId(record.date, record.time, record.contentHash.slice(0, 6));
      const lines = content.split('\n');
      lines[record.lineStart - 1] = `${lines[record.lineStart - 1]} ^${id}`;
      content = lines.join('\n');
      count += 1;
    }
    if (count > 0) await this.vault.modify(resolution.filePath, content);
    return count;
  }

  private async locateById(id: string): Promise<{ filePath: string; record: QuickMemoRecord }> {
    for (const filePath of this.quickMemoFiles()) {
      const date = dateFromPath(filePath);
      const content = await this.vault.read(filePath);
      const record = this.parser.parseFile(filePath, date, content, this.settings.parseMode).records.find((candidate) => candidate.id === id);
      if (record) return { filePath, record };
    }
    throw new Error(`Record not found: ${id}`);
  }

  private async replaceLines(filePath: string, lineStart: number, lineEnd: number, replacement: string): Promise<void> {
    const content = await this.vault.read(filePath);
    await this.vault.modify(filePath, replaceRange(content, lineStart, lineEnd, replacement));
  }

  private quickMemoFiles(): string[] {
    return this.vault.listMarkdownFiles().filter(isQuickMemoPath);
  }
}

function insertIntoSection(markdown: string, heading: string, serialized: string): string {
  const normalized = markdown.replace(/\n+$/u, '');
  const lines = normalized.split('\n');
  const headingPattern = headingLinePattern(heading);
  const headingIndex = lines.findIndex((line) => headingPattern.test(line));

  if (headingIndex === -1) {
    return `${normalized}\n\n${heading}\n\n${serialized}\n`;
  }

  const endPattern = headingEndPattern(heading);
  let insertAt = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (endPattern.test(lines[index])) {
      insertAt = index;
      break;
    }
  }

  const sectionLines = lines.slice(headingIndex + 1, insertAt);
  const nonBlankSection = sectionLines.filter((line) => line.trim() !== '');
  const before = lines.slice(0, headingIndex + 1);
  const after = lines.slice(insertAt);

  const section = nonBlankSection.length > 0
    ? ['', ...nonBlankSection, '', serialized, '']
    : ['', serialized, ''];

  return [...before, ...section, ...after].join('\n');
}

/** Append `text` at the end of the markdown file, with a blank line separator. */
function insertAtEnd(markdown: string, text: string): string {
  const trimmed = markdown.replace(/\n+$/u, '');
  return `${trimmed}\n\n${text}\n`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Replace lines [lineStart, lineEnd] (1-indexed, inclusive) of `markdown` with `replacement`. */
function replaceRange(markdown: string, lineStart: number, lineEnd: number, replacement: string): string {
  const lines = markdown.split('\n');
  const before = lines.slice(0, lineStart - 1);
  const after = lines.slice(lineEnd);
  const middle = replacement ? replacement.split('\n') : [];
  return [...before, ...middle, ...after].join('\n');
}

/** Strip a single `#tag` token (and tidy the surrounding spacing) from `text`. */
function stripTag(text: string, tag: string): string {
  const escaped = escapeRegExp(tag);
  return text
    .replace(new RegExp(`(^|\\s)${escaped}(?=$|\\s)`, 'gu'), '$1')
    .replace(/ {2,}/gu, ' ')
    .trim();
}
