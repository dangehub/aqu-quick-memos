export type QuickMemoType = 'memo' | 'todo';
export type InputMode = 'memo' | 'todo';
export type SortDirection = 'asc' | 'desc';
export type DateRangePreset = 'today' | '7d' | '30d' | 'custom';

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