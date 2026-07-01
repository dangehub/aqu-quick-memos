import type { ParseResult, ParseWarning, QuickMemoRecord, QuickMemoType, RecordDraft } from '../types';
import { contentHash, extractBlockId, stripBlockId } from './id';
import { headingEndPattern, headingLinePattern } from '../daily-notes/DailyNoteResolver';

// Task: matches "- [ ] HH:MM content" or "- [x] HH:MM content" (also [X]).
const TASK_RE = /^- \[( |x|X)\] (\d{2}:\d{2}) (.+)$/u;
// Normal memo: matches "- HH:MM content".
const MEMO_RE = /^- (\d{2}:\d{2}) (.+)$/u;
// Bare task line (multi-line): matches "- [ ] HH:MM" with nothing after time.
const BARE_TASK_RE = /^- \[( |x|X)\] (\d{2}:\d{2})\s*$/u;
// Bare memo line (multi-line): matches "- HH:MM" with nothing after time.
const BARE_MEMO_RE = /^- (\d{2}:\d{2})\s*$/u;
const TAG_RE = /(^|\s)(#[\p{L}\p{N}_/-]+)/gu;

export class QuickMemoParser {
  private readonly heading: () => string;

  constructor(heading: string | (() => string)) {
    this.heading = typeof heading === 'function' ? heading : () => heading;
  }

  parseFile(filePath: string, date: string, markdown: string, parseMode?: 'heading' | 'full'): ParseResult {
    const mode = parseMode ?? 'heading';
    const lines = markdown.split('\n');

    // Determine the scan range: section-based (heading mode) or entire file (full mode).
    let startLine = 0;
    let endLine = lines.length;
    if (mode === 'heading') {
      const section = this.findSection(lines);
      if (!section) return { records: [], warnings: [] };
      startLine = section.start;
      endLine = section.end;
    }

    const records: QuickMemoRecord[] = [];
    const warnings: ParseWarning[] = [];
    let index = startLine;

    while (index < endLine) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (!line.startsWith('- ')) {
        // In full mode, we silently skip non-memo lines (they're just diary content).
        // In heading mode, non-list content inside the section is a structure warning.
        if (mode === 'heading') {
          warnings.push({ filePath, line: index + 1, message: 'Non-list content inside Quick Memo section was ignored.', raw: line });
        }
        index += 1;
        continue;
      }

      const bodyLines: string[] = [];
      let lineEnd = index;
      let next = index + 1;
      while (next < endLine && isIndentedContinuation(lines[next])) {
        bodyLines.push(lines[next].replace(/^(  |\t)/u, ''));
        lineEnd = next;
        next += 1;
      }

      const parsed = this.parseRecordLine(line, bodyLines.join('\n'), filePath, date, index + 1, lineEnd + 1);
      if (parsed) {
        records.push(parsed);
      } else if (mode === 'heading') {
        warnings.push({ filePath, line: index + 1, message: 'Quick Memo list item did not match a supported record format.', raw: line });
      }
      index = next;
    }

    const seenIds = new Set<string>();
    for (const record of records) {
      if (record.id === undefined) continue;
      if (seenIds.has(record.id)) {
        warnings.push({
          filePath,
          line: record.lineStart,
          message: `Duplicate Quick Memo block id: ${record.id}`,
          raw: record.raw,
        });
      } else {
        seenIds.add(record.id);
      }
    }

    return { records, warnings };
  }

  serializeRecord(draft: RecordDraft, id: string | undefined): string {
    const content = draft.content.trim();
    const idPart = id ? ` ^${id}` : '';
    const bodyText = draft.body?.trim();

    const timePrefix = draft.type === 'todo'
      ? `- [${draft.completed ? 'x' : ' '}] ${draft.time}`
      : `- ${draft.time}`;

    // Single-line: everything on the time line
    if (!bodyText) return `${timePrefix} ${content}${idPart}`;

    // Multi-line: time on first line, all content indented, block id on last line
    const bodyLines = draft.body!
      .replace(/\r\n/gu, '\n')
      .split('\n');

    // Content on first indented line, continuation on rest
    const indentedLines = [`  ${content}`, ...bodyLines.map((line) => `  ${line}`)];

    // Put block id on the LAST indented line
    if (idPart) {
      indentedLines[indentedLines.length - 1] += idPart;
    }

    return `${timePrefix}\n${indentedLines.join('\n')}`;
  }

  private parseRecordLine(line: string, body: string, filePath: string, date: string, lineStart: number, lineEnd: number): QuickMemoRecord | undefined {
    const withoutId = stripBlockId(line);
    let id = extractBlockId(line);
    const taskMatch = withoutId.match(TASK_RE);
    const memoMatch = withoutId.match(MEMO_RE);
    const bareTaskMatch = withoutId.match(BARE_TASK_RE);
    const bareMemoMatch = withoutId.match(BARE_MEMO_RE);

    let type: QuickMemoType | undefined;
    let time: string;
    let content: string;
    let completed: boolean | undefined;
    let bodyText: string | undefined;

    if (taskMatch) {
      type = 'todo';
      completed = taskMatch[1].toLowerCase() === 'x';
      time = taskMatch[2];
      content = taskMatch[3];
      bodyText = body.trim() || undefined;
    } else if (memoMatch) {
      type = 'memo';
      time = memoMatch[1];
      content = memoMatch[2];
      bodyText = body.trim() || undefined;
    } else if (bareTaskMatch) {
      type = 'todo';
      completed = bareTaskMatch[1].toLowerCase() === 'x';
      time = bareTaskMatch[2];
      // Multi-line records place the block ID on the last indented line (see
      // serializeRecord).  When the main line doesn't carry one, extract it
      // from the last body line so the record keeps its stable identity.
      let cleanBody = body;
      if (!id) {
        const rawLines = body.split('\n');
        const lastIdx = rawLines.length - 1;
        if (lastIdx >= 0) {
          const tailId = extractBlockId(rawLines[lastIdx]);
          if (tailId) {
            id = tailId;
            rawLines[lastIdx] = stripBlockId(rawLines[lastIdx]);
            cleanBody = rawLines.join('\n');
          }
        }
      }
      const bodyLines = cleanBody.split('\n');
      content = bodyLines[0]?.trim() ?? '';
      bodyText = bodyLines.slice(1).join('\n').trim() || undefined;
    } else if (bareMemoMatch) {
      type = 'memo';
      time = bareMemoMatch[1];
      // Same logic as bareTaskMatch above: recover the block ID from the last
      // indented line when the main time line doesn't have one.
      let cleanBody = body;
      if (!id) {
        const rawLines = body.split('\n');
        const lastIdx = rawLines.length - 1;
        if (lastIdx >= 0) {
          const tailId = extractBlockId(rawLines[lastIdx]);
          if (tailId) {
            id = tailId;
            rawLines[lastIdx] = stripBlockId(rawLines[lastIdx]);
            cleanBody = rawLines.join('\n');
          }
        }
      }
      const bodyLines = cleanBody.split('\n');
      content = bodyLines[0]?.trim() ?? '';
      bodyText = bodyLines.slice(1).join('\n').trim() || undefined;
    } else {
      return undefined;
    }

    const bodyPart = bodyText || '';
    const raw = bodyPart ? `${line}\n${body}` : line;
    const label = type === 'todo' ? '待办' : '闪念';

    return {
      id,
      date,
      time,
      type,
      content: content.trim(),
      body: bodyText || undefined,
      tags: extractTags(`${content}\n${bodyPart}`),
      completed: type === 'todo' ? completed : undefined,
      filePath,
      lineStart,
      lineEnd,
      hasStableId: Boolean(id),
      raw,
      contentHash: contentHash(`${time} ${label} ${content} ${bodyPart}`),
    };
  }

  private findSection(lines: string[]): { start: number; end: number } | undefined {
    const heading = this.heading();
    const headingPattern = headingLinePattern(heading);
    const startHeading = lines.findIndex((line) => headingPattern.test(line));
    if (startHeading === -1) return undefined;

    const endPattern = headingEndPattern(heading);
    let end = lines.length;
    for (let index = startHeading + 1; index < lines.length; index += 1) {
      if (endPattern.test(lines[index])) {
        end = index;
        break;
      }
    }
    return { start: startHeading + 1, end };
  }
}

function isIndentedContinuation(line: string): boolean {
  return line.startsWith('  ') || line.startsWith('\t') || line.startsWith('> ');
}

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(TAG_RE)) {
    tags.add(match[2]);
  }
  return Array.from(tags);
}