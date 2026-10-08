import { letterFromPtcglName } from '../config/energyTypes'
import { DEFAULT_FORMAT, type DeckLine, type ListFormat, type ParseIssue, type ParseResult, type Section } from '../types'
import { normalizeText } from './normalize'

// Base format: "qty name CODE number". The number also accepts a short letter
// prefix (e.g. "TG12", "SWSH251") so gallery/promo prints don't get rejected.
export const CARD_LINE_RE = /^(\d+)\s+(.+?)\s+([A-Z0-9-]+)\s+([A-Z]{0,5}\d+)$/

const HEADER_RE = /^([^:]+):\s*(\d+)$/

// Keys are normalized (no accents, lowercase). PTCGL in Portuguese uses Treinador/Energia.
const KNOWN_HEADERS: Record<string, Section> = {
  pokemon: 'pokemon',
  trainer: 'trainer',
  treinador: 'trainer',
  energy: 'energy',
  energia: 'energy',
}
const TOTAL_HEADERS = new Set(['total cards', 'total de cartas'])

let keySeq = 0
export function newLineKey(): string {
  keySeq += 1
  return `l${Date.now().toString(36)}-${keySeq}`
}

interface DeclaredHeader {
  lineNo: number
  text: string
  expected: number
  cards: number
  lines: number
}

export function parsePtcgl(text: string): ParseResult {
  const lines: DeckLine[] = []
  const issues: ParseIssue[] = []
  const format: ListFormat = { ...DEFAULT_FORMAT, headers: { ...DEFAULT_FORMAT.headers } }
  // Lines before any header (or under an unknown one) still get parsed;
  // their section is guessed and later corrected by the API supertype.
  let section: Section | null = null
  // Declared header totals, checked against the parsed lines at the end.
  const declared: DeclaredHeader[] = []
  let current: DeclaredHeader | null = null

  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNo = index + 1
    const line = raw.trim()
    if (!line) return

    const header = HEADER_RE.exec(line)
    if (header && !/^\d/.test(line)) {
      const label = header[1].trim()
      const key = normalizeText(label)
      if (key in KNOWN_HEADERS) {
        section = KNOWN_HEADERS[key]
        format.headers[section] = label
        current = { lineNo, text: line, expected: Number(header[2]), cards: 0, lines: 0 }
        declared.push(current)
      } else if (TOTAL_HEADERS.has(key)) {
        format.totalLabel = label
        current = null
      } else {
        issues.push({ lineNo, text: line, reason: 'Cabeçalho desconhecido' })
        section = null
        current = null
      }
      return
    }

    const m = CARD_LINE_RE.exec(line)
    if (!m) {
      issues.push({ lineNo, text: line, reason: 'Linha fora do formato "qtd nome CÓDIGO número"' })
      return
    }

    const qty = Number(m[1])
    if (qty <= 0) {
      issues.push({ lineNo, text: line, reason: 'Quantidade inválida' })
      return
    }

    if (current) {
      current.cards += qty
      current.lines += 1
    }

    const name = m[2]
    const energyLetter = letterFromPtcglName(name)
    lines.push({
      key: newLineKey(),
      qty,
      name,
      setCode: m[3],
      number: m[4],
      sectionHint: energyLetter ? 'energy' : (section ?? 'pokemon'),
      energyLetter,
      status: 'pending',
    })
  })

  // Some exports count lines instead of copies in the header (e.g. "Pokémon: 15" over 24 cards).
  // Use that convention only when it explains every header and the copy count does not.
  const linesFit = declared.length > 0 && declared.every((d) => d.expected === d.lines)
  const cardsFit = declared.every((d) => d.expected === d.cards)
  if (linesFit && !cardsFit) format.countMode = 'lines'

  for (const d of declared) {
    const actual = format.countMode === 'lines' ? d.lines : d.cards
    if (d.expected !== actual) {
      issues.push({
        lineNo: d.lineNo,
        text: d.text,
        reason: `Total do cabeçalho (${d.expected}) difere da soma das cartas (${d.cards}); o total será recalculado`,
      })
    }
  }
  issues.sort((a, b) => a.lineNo - b.lineNo)

  return { lines, issues, format }
}
