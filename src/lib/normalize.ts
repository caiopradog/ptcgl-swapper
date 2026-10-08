/**
 * Normalizes free text for comparison: lowercase, no diacritics,
 * unified typographic quotes/dashes, collapsed whitespace.
 */
export function normalizeText(value: string | undefined | null): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strips leading zeros so "007" and "7" compare equal; keeps letter prefixes ("TG07" -> "TG7"). */
export function normalizeNumber(value: string): string {
  const m = /^([A-Za-z]*)0*(\d+)([A-Za-z]*)$/.exec(value.trim())
  if (!m) return value.trim().toUpperCase()
  return `${m[1].toUpperCase()}${m[2]}${m[3].toUpperCase()}`
}

/**
 * Prepares a value to be used inside a double-quoted Lucene phrase
 * (pokemontcg.io `q` syntax). Inside quotes only `\` and `"` need escaping;
 * apostrophes and accents were confirmed to work as-is (e.g. name:"Boss's Orders",
 * name:"Pokémon Catcher"). Typographic quotes are unified first.
 */
export function escapeLucenePhrase(value: string): string {
  return value
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

/** Escapes a bare (unquoted) Lucene term. */
export function escapeLuceneTerm(value: string): string {
  return value.replace(/([+\-!(){}[\]^"~*?:\\/&|'\s])/g, '\\$1')
}
