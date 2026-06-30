export type QuickMemoType = 'memo' | 'todo';
export type InputMode = 'memo' | 'todo';
export type SortDirection = 'asc' | 'desc';
export type DateRangePreset = 'today' | '7d' | '30d' | 'custom';
export type AttachmentFolderMode = 'obsidianDefault' | 'root' | 'sameFolder' | 'subFolder' | 'customFolder';
export type LinkStyle = 'obsidianDefault' | 'wiki' | 'markdown';
export type LinkPathFormat = 'obsidianDefault' | 'shortest' | 'relative' | 'absolute';

export interface QuickMemoSettings {
  userName: string;
  userSlogan: string;
  avatar: string;
  /** Section heading the plugin reads/writes, including the leading `#` marks
   *  (e.g. `### memos`). Any heading level is supported. */
  quickMemoHeading: string;
  overrideDailyNotesConfig: boolean;
  fallbackDailyNotesFolder: string;
  fallbackDateFormat: string;
  enableBlockIds: boolean;
  sortDirection: SortDirection;
  /** Where to save pasted/dropped images. */
  attachmentFolderMode: AttachmentFolderMode;
  /** Subfolder name when mode is 'subFolder'. */
  attachmentSubFolder: string;
  /** Custom absolute or vault-relative path when mode is 'customFolder'. */
  customAttachmentFolder: string;
  /** Link syntax for images/attachments: wiki (`![[...]]`) or markdown (`![](...)`). */
  linkStyle: LinkStyle;
  /** Path format inside links: shortest filename, relative from note, or absolute from vault. */
  linkPathFormat: LinkPathFormat;
  /** Auto-open the Quick Memo overview when the plugin loads. */
  openOnStartup: boolean;
}

export interface RecordDraft {
  date: string;
  time: string;
  type: QuickMemoType;
  content: string;
  body?: string;
  tags?: string[];
  completed?: boolean;
}

export interface WeakRecordLocator {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  date: string;
  time: string;
  contentHash: string;
}

export interface QuickMemoRecord {
  id?: string;
  date: string;
  time: string;
  type: QuickMemoType;
  content: string;
  body?: string;
  tags: string[];
  completed?: boolean;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  hasStableId: boolean;
  raw: string;
  contentHash: string;
}

export interface ParseWarning {
  filePath: string;
  line: number;
  message: string;
  raw: string;
}

export interface ParseResult {
  records: QuickMemoRecord[];
  warnings: ParseWarning[];
}

export interface DateFileResolution {
  date: string;
  filePath: string;
  source: 'daily-notes' | 'fallback';
}

export interface IndexQuery {
  text?: string;
  types?: QuickMemoType[];
  tags?: string[];
  startDate?: string;
  endDate?: string;
  completed?: boolean;
}

export interface HeatmapDay {
  date: string;
  count: number;
}