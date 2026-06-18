import type { ParseResult, ParseWarning, QuickMemoRecord, QuickMemoType, RecordDraft } from '../types';
import { contentHash, extractBlockId, stripBlockId } from './id';

const TYPE_LABELS: Record<QuickMemoType, string> = {
  record: '记录',
  flash: '闪念',
  todo: '待办',
};

const LABEL_TYPES: Record<'记录' | '闪念' | '待办', QuickMemoType> = {
  记录: 'record',
  闪念: 'flash',
  待办: 'todo',
};

function toQuickMemoType(label: string): QuickMemoType | undefined {
  if (label === '记录' || label === '闪念' || label === '待办') return LABEL_TYPES[label];
  return undefined;
}

const TASK_RE = /^- \[( |x|X)\] ([0-9]{2}:[0-9]{2}) \[(记录|闪念|待办)\] (.*)$/u;
const LIST_RE = /^- ([0-9]{2}:[0-9]{2}) \[(记录|闪念|待办)\] (.*)$/u;
const TAG_RE = /(^|\s)(#[\p{L}\p{N}_\-\/]+)/gu;

export class QuickMemoParser {
  constructor(private readonly heading: string) {}

  parseFile(filePath: string, date: string, markdown: string): ParseResult {
    const lines = markdown.split('\n');
    const section = this.findSection(lines);
    if (!section) return { records: [], warnings: [] };

    const records: QuickMemoRecord[] = [];
    const warnings: ParseWarning[] = [];
    let index = section.start;

    while (index < section.end) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (!line.startsWith('- ')) {
        warnings.push({ filePath, line: index + 1, message: 'Non-list content inside Quick Memo section was ignored.', raw: line });
        index += 1;
        continue;
      }

      const bodyLines: string[] = [];
      let lineEnd = index;
      let next = index + 1;
      while (next < section.end && isIndentedContinuation(lines[next])) {
        bodyLines.push(lines[next].replace(/^ {2}/u, ''));
        lineEnd = next;
        next += 1;
      }

      const parsed = this.parseRecordLine(line, bodyLines.join('\n'), filePath, date, index + 1, lineEnd + 1);
      if (parsed) {
        records.push(parsed);
      } else {
        warnings.push({ filePath, line: index + 1, message: 'Quick Memo list item did not match a supported record format.', raw: line });
      }
      index = next;
    }

    return { records, warnings };
  }

  serializeRecord(draft: RecordDraft, id: string | undefined): string {
    const label = TYPE_LABELS[draft.type];
    const content = draft.content.trim();
    const idPart = id ? ` ^${id}` : '';
    const firstLine = draft.type === 'todo'
      ? `- [${draft.completed ? 'x' : ' '}] ${draft.time} [${label}] ${content}${idPart}`
      : `- ${draft.time} [${label}] ${content}${idPart}`;

    if (!draft.body?.trim()) return firstLine;

    const body = draft.body
      .replace(/\r\n/gu, '\n')
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return `${firstLine}\n${body}`;
  }

  private parseRecordLine(line: string, body: string, filePath: string, date: string, lineStart: number, lineEnd: number): QuickMemoRecord | undefined {
    const withoutId = stripBlockId(line);
    const id = extractBlockId(line);
    const taskMatch = withoutId.match(TASK_RE);
    const listMatch = withoutId.match(LIST_RE);
    const match = taskMatch ?? listMatch;
    if (!match) return undefined;

    const isTask = Boolean(taskMatch);
    const time = isTask ? match[2] : match[1];
    const label = isTask ? match[3] : match[2];
    const content = isTask ? match[4] : match[3];
    const type = toQuickMemoType(label);
    if (!type) return undefined;
    const raw = body ? `${line}\n${body}` : line;

    return {
      id,
      date,
      time,
      type,
      content: content.trim(),
      body: body.trim() ? body : undefined,
      tags: extractTags(`${content}\n${body}`),
      completed: type === 'todo' ? match[1].toLowerCase() === 'x' : undefined,
      filePath,
      lineStart,
      lineEnd,
      hasStableId: Boolean(id),
      raw,
      contentHash: contentHash(`${time} ${label} ${content} ${body}`),
    };
  }

  private findSection(lines: string[]): { start: number; end: number } | undefined {
    const headingPattern = new RegExp(`^##\\s+${escapeRegExp(this.heading)}\\s*$`, 'u');
    const startHeading = lines.findIndex((line) => headingPattern.test(line));
    if (startHeading === -1) return undefined;

    let end = lines.length;
    for (let index = startHeading + 1; index < lines.length; index += 1) {
      if (/^##\s+/u.test(lines[index])) {
        end = index;
        break;
      }
    }
    return { start: startHeading + 1, end };
  }
}

function isIndentedContinuation(line: string): boolean {
  return line.startsWith('  ');
}

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(TAG_RE)) {
    tags.add(match[2]);
  }
  return Array.from(tags);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
