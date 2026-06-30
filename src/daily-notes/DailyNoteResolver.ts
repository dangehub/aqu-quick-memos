import type { DateFileResolution, QuickMemoSettings } from '../types';
import type { VaultLike } from '../test/fakeVault';
import type { DailyNotesConfig } from './obsidianInternal';

export type DateFormatFn = (date: string, format: string) => string;

export class DailyNoteResolver {
  constructor(
    private readonly vault: VaultLike,
    private readonly dailyNotesConfig: DailyNotesConfig | undefined,
    private readonly settings: QuickMemoSettings,
    private readonly formatFn: DateFormatFn = formatDate,
  ) {}

  async resolve(date: string): Promise<DateFileResolution> {
    // When the user opts into the plugin's own path settings, ignore the (often
    // unreliable to read) Daily Notes config entirely and use the folder/format
    // they configured below.
    const useOwn = this.settings.overrideDailyNotesConfig;
    const config = useOwn ? undefined : this.dailyNotesConfig;
    const hasDailyNotesConfig = Boolean(config?.folder || config?.format);
    const folder = trimSlashes(hasDailyNotesConfig ? config?.folder ?? '' : this.settings.fallbackDailyNotesFolder);
    const format = hasDailyNotesConfig ? config?.format ?? this.settings.fallbackDateFormat : this.settings.fallbackDateFormat;
    // The plugin now writes directly into the user's diary file (e.g.
    // `2026-06-19.md`), no separate `-quick-memos` file.
    const relative = `${this.formatFn(date, format)}.md`;
    return {
      date,
      filePath: folder ? `${folder}/${relative}` : relative,
      source: hasDailyNotesConfig ? 'daily-notes' : 'fallback',
    };
  }

  async ensureDailyNote(date: string): Promise<string> {
    const resolution = await this.resolve(date);
    const heading = this.settings.quickMemoHeading;

    if (!this.vault.exists(resolution.filePath)) {
      await this.vault.create(resolution.filePath, `\n${heading}\n`);
      return resolution.filePath;
    }

    const content = await this.vault.read(resolution.filePath);
    const headingPattern = headingLinePattern(heading);
    if (!headingPattern.test(content)) {
      const separator = content.endsWith('\n') ? '\n' : '\n\n';
      await this.vault.modify(resolution.filePath, `${content}${separator}${heading}\n`);
    }

    return resolution.filePath;
  }
}

export function formatDate(date: string, format: string): string {
  const [year, month, day] = date.split('-');
  return format
    .replace(/YYYY/gu, year)
    .replace(/MM/gu, month)
    .replace(/DD/gu, day);
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/gu, '');
}

/** Split a configured heading like `### memos` into its level and text. */
export function parseHeading(heading: string): { level: number; text: string } {
  const match = heading.match(/^(#{1,6})\s*(.+?)\s*$/u);
  if (match) return { level: match[1].length, text: match[2] };
  return { level: 2, text: heading.trim() };
}

/** Build a regex matching the configured heading line. */
export function headingLinePattern(heading: string): RegExp {
  const { level, text } = parseHeading(heading);
  return new RegExp(`^#{${level}}\\s+${escapeRegExp(text)}\\s*$`, 'mu');
}

/** Build a regex matching any heading of the SAME level or HIGHER (fewer `#`),
 *  used to find where a section ends. */
export function headingEndPattern(heading: string): RegExp {
  const { level } = parseHeading(heading);
  return new RegExp(`^#{1,${level}}\\s+`, 'mu');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}