import type { QuickMemoSettings, SortDirection } from '../types';

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
};

const VALID_SORTS: SortDirection[] = ['asc', 'desc'];

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

  return merged;
}

function ensureString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}