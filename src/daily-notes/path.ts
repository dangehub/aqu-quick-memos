/** Filename suffix that keeps Quick Memo files separate from the user's regular
 *  daily notes, so the plugin never writes into a plain `yyyy-MM-dd.md`. */
export const QUICK_MEMO_FILENAME_SUFFIX = '-quick-memos';

/**
 * Extract the YYYY-MM-DD date from a Quick Memo file path. Only the plugin's own
 * `yyyy-MM-dd-quick-memos.md` files are indexable/editable; plain daily notes
 * (`yyyy-MM-dd.md`) are intentionally ignored.
 */
export function dateFromPath(path: string): string {
  const suffix = escapeRegExp(QUICK_MEMO_FILENAME_SUFFIX);
  const match = path.match(new RegExp(`([0-9]{4})[-/]([0-9]{2})[-/]([0-9]{2})${suffix}\\.md$`, 'u'));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '1970-01-01';
}

export function isQuickMemoPath(path: string): boolean {
  return dateFromPath(path) !== '1970-01-01';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
