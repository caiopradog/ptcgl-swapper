import type { TcgCard } from '../src/types'
import { normalizeNumber } from '../src/lib/normalize'
import { ALL_BASIC_ENERGY, SETS } from './fixtures'

export interface MockCall {
  url: URL
  q: string | null
  headers: Record<string, string>
}

/**
 * Tiny fake of pokemontcg.io supporting the query shapes the app sends.
 * `failures` lets a test make the first N calls return a given HTTP status.
 */
export function createMockFetch(cards: TcgCard[], failures: number[] = []) {
  const calls: MockCall[] = []
  const queue = [...failures]

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const q = url.searchParams.get('q')
    calls.push({ url, q, headers: (init?.headers ?? {}) as Record<string, string> })

    const status = queue.shift()
    if (status) return new Response('error', { status })

    let data: unknown[]
    if (url.pathname.endsWith('/sets')) {
      data = SETS
    } else if (q === 'supertype:Energy subtypes:Basic') {
      data = ALL_BASIC_ENERGY
    } else if (q?.includes('name:"')) {
      // Phrase match is looser than exact (like the real API: "Boss's Orders" also hits "Boss's Orders (Ghetsis)").
      const phrases = [...q.matchAll(/name:"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1').toLowerCase())
      data = cards.filter((c) => phrases.some((p) => c.name.toLowerCase().includes(p)))
    } else if (q?.includes('set.id:')) {
      // OR of "((set.id:a OR set.id:b) number:N)" clauses.
      const clauses = [...q.matchAll(/\(\(([^)]*)\) number:([\w-]+)\)/g)].map((m) => ({
        setIds: [...m[1].matchAll(/set\.id:([\w.-]+)/g)].map((x) => x[1]),
        number: m[2],
      }))
      data = cards.filter((c) =>
        clauses.some((cl) => cl.setIds.includes(c.set.id) && normalizeNumber(cl.number) === normalizeNumber(c.number)),
      )
    } else {
      data = []
    }
    return new Response(JSON.stringify({ data, page: 1, pageSize: 250, count: data.length, totalCount: data.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  return { fetchImpl, calls }
}
