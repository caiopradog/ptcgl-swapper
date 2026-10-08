import { describe, expect, it } from 'vitest'
import { createTcgApi, type ResolveUpdate } from '../src/services/tcgApi'
import { findAlternatives } from '../src/services/alternatives'
import { parsePtcgl } from '../src/lib/parsePtcgl'
import { createLimiter } from '../src/services/http'
import * as F from './fixtures'
import { createMockFetch } from './mockApi'

const DB = [
  F.charizardObf, F.charizardObfSir, F.charizardMew, F.charizardPaf, F.charizardPromoDiffAttack,
  F.card('sv3-7', 'Masquerain', 'Pokémon', { regulationMark: 'G' }),
  F.card('svp-85', 'Pikachu with Grey Felt Hat', 'Pokémon', { regulationMark: 'G' }),
  F.ultraBallSvi, F.ultraBallPaf, F.ultraBallMeg, F.ultraBallOld,
  F.card('sv2-185', 'Iono', 'Trainer', { subtypes: ['Supporter'] }),
  F.card('sv2-172', "Boss's Orders (Ghetsis)", 'Trainer', { subtypes: ['Supporter'] }),
  F.bossRcl, F.bossLorTg, F.bossMeg, F.telepathicPor,
  ...F.ALL_BASIC_ENERGY,
]

function setup(failures: number[] = [], apiKey?: string) {
  const mock = createMockFetch(DB, failures)
  const api = createTcgApi({
    fetchImpl: mock.fetchImpl, useCache: false, apiKey, retry: { baseDelayMs: 0 }, setsFallback: F.SETS,
  })
  return { api, ...mock }
}

async function resolve(api: ReturnType<typeof createTcgApi>, text: string) {
  const { lines } = parsePtcgl(text)
  const updates: ResolveUpdate[] = []
  const { error } = await api.resolveLines(lines, (u) => updates.push(...u))
  const byName = (name: string) => updates.find((u) => lines.find((l) => l.key === u.key)?.name === name)!
  return { lines, updates, error, byName }
}

describe('tcgApi.resolveLines', () => {
  it('resolves the whole deck with a single OR query', async () => {
    const { api, calls } = setup()
    const { updates, error } = await resolve(api, '1 Charizard ex OBF 125\n2 Masquerain OBF 007\n4 Ultra Ball SVI 196')
    expect(error).toBeUndefined()
    expect(updates.every((u) => u.status === 'resolved')).toBe(true)
    const cardQueries = calls.filter((c) => c.url.pathname.endsWith('/cards')).map((c) => c.q)
    expect(cardQueries).toEqual([
      '((set.id:sv3) number:125) OR ((set.id:sv3) number:7) OR ((set.id:sv1) number:196)',
    ])
  })

  it('looks up all missing names in a single OR query', async () => {
    const { api, calls } = setup()
    await resolve(api, "1 Iono XYZ 1\n1 Boss's Orders PAL 999\n1 Basic {R} Energy MEE 10")
    const nameQueries = calls.filter((c) => c.q?.includes('name:')).map((c) => c.q)
    expect(nameQueries).toEqual(['name:"Iono" OR name:"Boss\'s Orders"'])
  })

  it('splits very large decks into several queries', async () => {
    const { api, calls } = setup()
    const text = Array.from({ length: 45 }, (_, i) => `1 Card ${i} OBF ${i + 1}`).join('\n')
    await resolve(api, text)
    const numberQueries = calls.filter((c) => c.q?.includes('set.id:'))
    expect(numberQueries).toHaveLength(2)
    expect(numberQueries[0].q!.match(/number:/g)).toHaveLength(40)
  })

  it('reuses cards already resolved by an earlier import', async () => {
    const { cacheClearMemory } = await import('../src/services/cache')
    cacheClearMemory()
    const mock = createMockFetch(DB)
    const api = createTcgApi({ fetchImpl: mock.fetchImpl, retry: { baseDelayMs: 0 }, setsFallback: F.SETS })
    await resolve(api, '1 Charizard ex OBF 125')
    const { updates } = await resolve(api, '1 Charizard ex OBF 125\n4 Ultra Ball SVI 196')
    expect(updates.map((u) => u.card?.id).sort()).toEqual(['sv1-196', 'sv3-125'])
    const cardQueries = mock.calls.filter((c) => c.url.pathname.endsWith('/cards')).map((c) => c.q)
    expect(cardQueries).toEqual(['((set.id:sv3) number:125)', '((set.id:sv1) number:196)'])
    cacheClearMemory()
  })

  it('resolves Trainer Gallery codes (LOR-TG 24 → swsh11tg TG24)', async () => {
    const { api, calls } = setup()
    const { updates } = await resolve(api, "1 Boss's Orders LOR-TG 24")
    expect(updates[0]).toMatchObject({ status: 'resolved', card: { id: 'swsh11tg-TG24' } })
    expect(updates[0].approximate).toBeUndefined()
    expect(calls.some((c) => c.q === '((set.id:swsh11tg) number:TG24)')).toBe(true)
  })

  it('expands energy symbols for the name fallback (Telepathic {P} Energy)', async () => {
    const { api } = setup()
    const { updates } = await resolve(api, '4 Telepathic {P} Energy XYZ 88')
    expect(updates[0]).toMatchObject({ status: 'resolved', card: { id: 'me3-88' } })
  })

  it('handles promo codes and leading zeros', async () => {
    const { api } = setup()
    const { updates } = await resolve(api, '1 Pikachu with Grey Felt Hat PR-SV 085')
    expect(updates[0]).toMatchObject({ status: 'resolved', card: { id: 'svp-85' } })
  })

  it('leaves an unknown basic energy (MEE 10) unresolved without a name search', async () => {
    const { api, calls } = setup()
    const { updates } = await resolve(api, '1 Basic {R} Energy MEE 10')
    expect(updates).toEqual([{ key: expect.any(String), status: 'unresolved' }])
    expect(calls.some((c) => c.q?.startsWith('name:'))).toBe(false)
  })

  it('falls back to an exact-name search and flags the print as approximate', async () => {
    const { api } = setup()
    const { byName } = await resolve(api, "1 Iono XYZ 1\n1 Boss's Orders PAL 999\n1 Totally Fake Card OBF 999")
    expect(byName('Iono')).toMatchObject({ status: 'resolved', approximate: true, card: { id: 'sv2-185' } })
    // Phrase search also returns "Boss's Orders (Ghetsis)"; the exact-name filter keeps only the real ones.
    expect(byName("Boss's Orders")).toMatchObject({ status: 'resolved', approximate: true, card: { id: 'me1-114' } })
    expect(byName('Totally Fake Card')).toMatchObject({ status: 'unresolved' })
  })

  it('retries transient 5xx errors', async () => {
    // 0 = let /sets through; the card query then fails twice before succeeding.
    const { api, calls } = setup([0, 502, 500])
    const { updates, error } = await resolve(api, '1 Charizard ex OBF 125')
    expect(error).toBeUndefined()
    expect(updates[0].status).toBe('resolved')
    expect(calls.length).toBe(4) // /sets + 2 failed /cards + 1 successful /cards
  })

  it('returns a friendly error after repeated 429s and keeps the deck usable', async () => {
    // 2 attempts for /sets (→ snapshot), then 5 each for the number and the name queries.
    const { api } = setup(Array(12).fill(429))
    const { updates, error } = await resolve(api, '1 Charizard ex OBF 125')
    expect((error as Error).message).toMatch(/429/)
    expect(updates[0].status).toBe('unresolved')
  })

  it('sends X-Api-Key only when configured', async () => {
    const without = setup()
    await without.api.getSetIndex()
    expect(without.calls[0].headers).toEqual({})
    const withKey = setup([], 'secret')
    await withKey.api.getSetIndex()
    expect(withKey.calls[0].headers).toEqual({ 'X-Api-Key': 'secret' })
  })

  it('falls back to the bundled set list quickly when /sets fails', async () => {
    const { api, calls } = setup([500, 502])
    const { updates, error } = await resolve(api, '1 Charizard ex OBF 125')
    expect(error).toBeUndefined()
    expect(updates[0]).toMatchObject({ status: 'resolved', card: { id: 'sv3-125' } })
    expect(calls.filter((c) => c.url.pathname.endsWith('/sets'))).toHaveLength(2)
  })

  it('maps one PTCGL code to every API set that uses it', async () => {
    const { api } = setup()
    const index = await api.getSetIndex()
    expect(index.idsByCode.get('SIT')).toEqual(['swsh12', 'swsh12tg'])
    expect(index.idsByCode.get('PR-SV')).toEqual(['svp'])
  })
})

describe('findAlternatives', () => {
  it('offers same-type energy arts for an energy the API does not know (MEE 10)', async () => {
    const { api } = setup()
    const [line] = parsePtcgl('1 Basic {R} Energy MEE 10').lines
    const res = await findAlternatives({ ...line, status: 'unresolved' }, api)
    expect(res.kind).toBe('energy')
    // tk1a has no PTCGL code, so it is not exportable and is left out.
    expect(res.equivalent.map((c) => c.id)).toEqual(['sv3-230', 'sve-2', 'sve-10', 'swsh12-153'])
    expect(res.exportIds.get('sve-10')).toEqual({ setCode: 'SVE', number: '10' })
  })

  it('returns every same-name trainer, regardless of text', async () => {
    const { api } = setup()
    const [line] = parsePtcgl('4 Ultra Ball SVI 196').lines
    const res = await findAlternatives({ ...line, status: 'resolved', card: F.ultraBallSvi }, api)
    expect(res.kind).toBe('trainer')
    expect(res.equivalent.map((c) => c.id)).toEqual(['me1-131', 'sv4pt5-91', 'sv1-196', 'swsh12-150'])
    expect(res.nonEquivalent).toEqual([])
  })

  it('exports Trainer Gallery prints as "<code>-TG <n>"', async () => {
    const { api } = setup()
    const [line] = parsePtcgl("2 Boss's Orders RCL 189").lines
    const res = await findAlternatives({ ...line, status: 'resolved', card: F.bossRcl }, api)
    expect(res.equivalent.map((c) => c.id)).toEqual(['me1-114', 'swsh11tg-TG24', 'swsh2-189'])
    expect(res.exportIds.get('swsh11tg-TG24')).toEqual({ setCode: 'LOR-TG', number: '24' })
  })

  it('splits Pokémon into equivalent and non-equivalent', async () => {
    const { api } = setup()
    const [line] = parsePtcgl('1 Charizard ex OBF 125').lines
    const res = await findAlternatives({ ...line, status: 'resolved', card: F.charizardObf }, api)
    expect(res.kind).toBe('pokemon')
    expect(res.equivalent.map((c) => c.id)).toEqual(['sv4pt5-54', 'sv3-125', 'sv3-223'])
    expect(res.nonEquivalent.map((c) => c.id)).toEqual(['sv3pt5-6', 'svp-56'])
  })

  it('explains when a non-energy card could not be resolved', async () => {
    const { api } = setup()
    const [line] = parsePtcgl('1 Totally Fake Card OBF 999').lines
    const res = await findAlternatives({ ...line, status: 'unresolved' }, api)
    expect(res.notice).toBeTruthy()
    expect(res.equivalent).toEqual([])
  })
})

describe('createLimiter', () => {
  it('never runs more than N tasks at once', async () => {
    const limit = createLimiter(2)
    let active = 0
    let peak = 0
    const task = () =>
      limit(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active--
      })
    await Promise.all([task(), task(), task(), task(), task()])
    expect(peak).toBe(2)
  })
})
