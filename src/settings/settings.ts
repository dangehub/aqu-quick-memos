import type { QuickMemoSettings, SortDirection, InsertMode, ParseMode } from '../types';

export const DEFAULT_SETTINGS: QuickMemoSettings = {
  userName: 'Quick Memo',
  userSlogan: 'Capture the moment.',
  avatar: '',
  quickMemoHeading: '### memos',
  overrideDailyNotesConfig: true,
  fallbackDailyNotesFolder: '',
  fallbackDateFormat: 'YYYY-MM-DD',
  enableBlockIds: true,
  sortDirection: 'desc',
  attachmentFolderMode: 'obsidianDefault',
  attachmentSubFolder: 'assets',
  customAttachmentFolder: '',
  linkStyle: 'obsidianDefault',
  linkPathFormat: 'obsidianDefault',
  openOnStartup: false,
  insertMode: 'heading',
  parseMode: 'heading',
};

const VALID_SORTS: SortDirection[] = ['asc', 'desc'];
const VALID_INSERT_MODES: InsertMode[] = ['heading', 'end'];
const VALID_PARSE_MODES: ParseMode[] = ['heading', 'full'];

export function normalizeSettings(raw: unknown): QuickMemoSettings {
  const value = isObject(raw) ? raw : {};
  const merged = { ...DEFAULT_SETTINGS, ...value } as QuickMemoSettings;

  if (!VALID_SORTS.includes(merged.sortDirection)) {
    merged.sortDirection = DEFAULT_SETTINGS.sortDirection;
  }

  merged.userName = ensureString(merged.userName, DEFAULT_SETTINGS.userName);
  merged.userSlogan = ensureString(merged.userSlogan, DEFAULT_SETTINGS.userSlogan);
  merged.avatar = ensureString(merged.avatar, DEFAULT_SETTINGS.avatar);
  merged.quickMemoHeading = ensureString(merged.quickMemoHeading, DEFAULT_SETTINGS.quickMemoHeading).trim() || DEFAULT_SETTINGS.quickMemoHeading;
  merged.overrideDailyNotesConfig = typeof merged.overrideDailyNotesConfig === 'boolean' ? merged.overrideDailyNotesConfig : DEFAULT_SETTINGS.overrideDailyNotesConfig;
  merged.fallbackDailyNotesFolder = ensureString(merged.fallbackDailyNotesFolder, DEFAULT_SETTINGS.fallbackDailyNotesFolder).trim();
  merged.fallbackDateFormat = ensureString(merged.fallbackDateFormat, DEFAULT_SETTINGS.fallbackDateFormat).trim() || DEFAULT_SETTINGS.fallbackDateFormat;
  merged.enableBlockIds = typeof merged.enableBlockIds === 'boolean' ? merged.enableBlockIds : DEFAULT_SETTINGS.enableBlockIds;
  merged.insertMode = VALID_INSERT_MODES.includes(merged.insertMode as InsertMode) ? merged.insertMode as InsertMode : DEFAULT_SETTINGS.insertMode;
  merged.parseMode = VALID_PARSE_MODES.includes(merged.parseMode as ParseMode) ? merged.parseMode as ParseMode : DEFAULT_SETTINGS.parseMode;

  return merged;
}

function ensureString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}