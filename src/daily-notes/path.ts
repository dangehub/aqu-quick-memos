/**
 * Extract the YYYY-MM-DD date from a diary file path. The plugin now reads the
 * user's regular daily notes directly (no `-quick-memos` suffix), so a path is
 * considered a Quick Memo path when its filename contains a recognizable
 * `YYYY-MM-DD` date. Anything else returns `'1970-01-01'`.
 */
export function dateFromPath(path: string): string {
  const base = path.split('/').pop() ?? path;
  const stripped = base.replace(/\.md$/u, '');
  const match = stripped.match(/([0-9]{4})[-/]([0-9]{2})[-/]([0-9]{2})/u);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '1970-01-01';
}

export function isQuickMemoPath(path: string): boolean {
  return dateFromPath(path) !== '1970-01-01';
}