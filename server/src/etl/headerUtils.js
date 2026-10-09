// Normalise a column name for fuzzy matching
export function normKey(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Build a name→index map from a header array using normalised keys
export function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((h, i) => { map[normKey(h)] = i; });
  return map;
}

// Resolve a set of candidate normalised keys against the header map.
// Returns the first matching column index, or throws if none found.
export function resolveCol(headerMap, candidates, label) {
  for (const c of candidates) {
    if (normKey(c) in headerMap) return headerMap[normKey(c)];
  }
  const found = Object.keys(headerMap).join(', ');
  throw new Error(
    `Required column "${label}" not found.\n  Tried: ${candidates.join(', ')}\n  Found: ${found}`
  );
}

// Parse a value that may be the literal string "Null", empty, or a number.
// Returns null for missing, else a float.
export function parseReading(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
