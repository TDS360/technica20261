/**
 * Browser stub for the `node:fs` import inside Section 1's investigation
 * store. The store only touches the filesystem when a `persistencePath` is
 * configured, which never happens in the browser build — statuses are kept
 * in memory and mirrored to Supabase by App.tsx. Vite aliases `node:fs`
 * here (see vite.config.ts).
 */
export function existsSync(): boolean {
  return false;
}

export function writeFileSync(): void {
  // no-op in the browser
}

export function readFileSync(): never {
  throw new Error('node:fs is not available in the browser build');
}
