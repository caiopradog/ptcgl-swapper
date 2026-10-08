import { normalizeNumber } from './normalize'

/**
 * PTCGL writes gallery subsets as "<code>-TG <n>" / "<code>-GG <n>" (e.g. "LOR-TG 24"),
 * while the API keeps them in their own set ("swsh11tg") with a prefixed,
 * zero-padded number ("TG24", "TG05").
 */
const GALLERY_CODE_RE = /^(.+)-(TG|GG)$/
const GALLERY_NUMBER_RE = /^(TG|GG)0*(\d+)$/i

export interface ExportId {
  setCode: string
  number: string
}

export function galleryOf(setCode: string): { base: string; prefix: 'TG' | 'GG' } | undefined {
  const m = GALLERY_CODE_RE.exec(setCode.toUpperCase())
  return m ? { base: m[1], prefix: m[2] as 'TG' | 'GG' } : undefined
}

/** Card number as the API stores it, for a PTCGL code + number. */
export function apiNumberFor(setCode: string, number: string): string {
  const gallery = galleryOf(setCode)
  if (gallery && /^\d+$/.test(number)) return `${gallery.prefix}${String(Number(number)).padStart(2, '0')}`
  return normalizeNumber(number)
}

/** PTCGL code + number for an API card, given its set's ptcgoCode. */
export function exportIdFor(setId: string, ptcgoCode: string, apiNumber: string): ExportId {
  const m = GALLERY_NUMBER_RE.exec(apiNumber)
  if (m && setId.toLowerCase().endsWith(m[1].toLowerCase())) {
    return { setCode: `${ptcgoCode}-${m[1].toUpperCase()}`, number: m[2] }
  }
  return { setCode: ptcgoCode, number: apiNumber }
}
