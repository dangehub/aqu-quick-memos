import { BLOCK_ID_PREFIX } from '../constants';

const QUICK_MEMO_BLOCK_ID = /\s\^(\S+)\s*$/u;

export function createBlockId(date: string, time: string, suffix: string): string {
  const compactDate = date.replace(/[^0-9]/gu, '');
  const compactTime = time.replace(/[^0-9]/gu, '').padEnd(6, '0').slice(0, 6);
  const safeSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/gu, '').slice(0, 8) || '0000';
  return `${BLOCK_ID_PREFIX}-${compactDate}-${compactTime}-${safeSuffix}`;
}

export function randomIdSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function extractBlockId(text: string): string | undefined {
  return text.match(QUICK_MEMO_BLOCK_ID)?.[1];
}

export function stripBlockId(text: string): string {
  return text.replace(QUICK_MEMO_BLOCK_ID, '').trimEnd();
}

export function contentHash(text: string): string {
  const normalized = text.trim().replace(/\s+/gu, ' ');
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}
