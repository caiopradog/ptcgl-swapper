import { describe, expect, it } from 'vitest'
import { createDeckStore } from '../src/composables/useDeck'
import type { ResolveUpdate } from '../src/services/tcgApi'
import type { DeckLine, TcgCard } from '../src/types'
import * as F from './fixtures'

const BY_PRINT: Record<string, TcgCard> = {
  'OBF|125': F.charizardObf,
  'OBF|223': F.charizardObfSir,
  'SVI|196': F.ultraBallSvi,
  'PAF|91': F.ultraBallPaf,
  'SVE|2': F.fireEnergySve,
}

// Resolver stub: no network, resolves from the table above.
const fakeApi = {
  async resolveLines(lines: DeckLine[], onUpdate: (u: ResolveUpdate[]) => void) {
    onUpdate(
      lines.map((l) => {
        const card = BY_PRINT[`${l.setCode}|${Number(l.number)}`]
        return card ? { key: l.key, status: 'resolved' as const, card } : { key: l.key, status: 'unresolved' as const }
      }),
    )
    return {}
  },
}

const DECK = `Pokémon: 3
2 Charizard ex OBF 125
1 Charizard ex OBF 223

Trainer: 4
3 Ultra Ball SVI 196
1 Ultra Ball PAF 91

Energy: 2
1 Basic {R} Energy MEE 10
1 Basic {R} Energy SVE 2`

const to = (card: TcgCard, setCode: string) => ({ setCode, number: card.number })

async function load() {
  const deck = createDeckStore(fakeApi)
  await deck.importText(DECK)
  const key = (name: string, number: string) => deck.lines.value.find((l) => l.name === name && l.number === number)!.key
  return { deck, key }
}

describe('useDeck', () => {
  it('imports and resolves lines', async () => {
    const { deck } = await load()
    expect(deck.totals.value).toMatchObject({ pokemon: 3, trainer: 4, energy: 2, all: 9 })
    expect(deck.lines.value.filter((l) => l.status === 'unresolved')).toHaveLength(1)
  })

  it('swaps every copy of a line, keeping the quantity', async () => {
    const { deck, key } = await load()
    deck.swap(key('Charizard ex', '125'), F.charizardPaf, to(F.charizardPaf, 'PAF'))
    expect(deck.exportText.value).toContain('2 Charizard ex PAF 54')
    expect(deck.exportText.value).not.toContain('OBF 125')
  })

  it('merges with an existing line of the chosen print, summing quantities', async () => {
    const { deck, key } = await load()
    deck.swap(key('Ultra Ball', '196'), F.ultraBallPaf, to(F.ultraBallPaf, 'PAF'))
    const ultra = deck.lines.value.filter((l) => l.name === 'Ultra Ball')
    expect(ultra).toHaveLength(1)
    expect(ultra[0]).toMatchObject({ qty: 4, setCode: 'PAF', number: '91' })
    expect(deck.totals.value.trainer).toBe(4)
  })

  it('swaps an unresolved basic energy and exports the PTCGL name from the letter', async () => {
    const { deck, key } = await load()
    deck.swap(key('Basic {R} Energy', '10'), F.fireEnergySveHolo, to(F.fireEnergySveHolo, 'SVE'))
    expect(deck.exportText.value).toContain('1 Basic {R} Energy SVE 10')
    expect(deck.exportText.value).not.toContain('MEE')
    // Swapping into a print already in the deck merges.
    deck.swap(key('Basic {R} Energy', '10'), F.fireEnergySve, to(F.fireEnergySve, 'SVE'))
    expect(deck.exportText.value).toMatch(/Energy: 2\n2 Basic \{R\} Energy SVE 2\n$/)
  })

  it('keeps the PTCGL name of the line when swapping', async () => {
    const deck = createDeckStore(fakeApi)
    await deck.importText('Energia: 1\n4 Telepathic {P} Energy POR 88')
    deck.swap(deck.lines.value[0].key, F.telepathicPor, { setCode: 'POR', number: '88' })
    expect(deck.exportText.value).toBe('Energia: 1\n4 Telepathic {P} Energy POR 88\n')
  })

  it('swaps to a Trainer Gallery print using its PTCGL code', async () => {
    const deck = createDeckStore(fakeApi)
    await deck.importText("Trainer: 2\n2 Boss's Orders RCL 189")
    deck.swap(deck.lines.value[0].key, F.bossLorTg, { setCode: 'LOR-TG', number: '24' })
    expect(deck.exportText.value).toBe("Trainer: 2\n2 Boss's Orders LOR-TG 24\n")
  })

  it('undoes swaps one at a time, including merges', async () => {
    const { deck, key } = await load()
    const original = deck.exportText.value
    deck.swap(key('Ultra Ball', '196'), F.ultraBallPaf, to(F.ultraBallPaf, 'PAF'))
    const afterFirst = deck.exportText.value
    deck.swap(key('Charizard ex', '125'), F.charizardPaf, to(F.charizardPaf, 'PAF'))
    expect(deck.canUndo.value).toBe(true)
    deck.undo()
    expect(deck.exportText.value).toBe(afterFirst)
    deck.undo()
    expect(deck.exportText.value).toBe(original)
    expect(deck.canUndo.value).toBe(false)
    deck.undo() // no-op
    expect(deck.exportText.value).toBe(original)
  })

  it('resets to the input screen', async () => {
    const { deck } = await load()
    deck.reset()
    expect(deck.imported.value).toBe(false)
    expect(deck.lines.value).toEqual([])
    expect(deck.canUndo.value).toBe(false)
  })

  it('warns about >4 copies, unresolved cards and illegal marks (not basic energy)', async () => {
    const deck = createDeckStore(fakeApi)
    await deck.importText('3 Charizard ex OBF 125\n2 Charizard ex OBF 223\n5 Basic {R} Energy SVE 2\n1 Mystery Card XYZ 1')
    const kinds = deck.warnings.value.map((w) => w.kind)
    expect(deck.warnings.value.find((w) => w.kind === 'copies')?.message).toMatch(/Charizard ex: 5/)
    expect(kinds.filter((k) => k === 'copies')).toHaveLength(1) // energy is exempt
    expect(kinds).toContain('unresolved')
    // Both Charizard prints are mark G (not in H/I/J); the energy is exempt.
    expect(kinds.filter((k) => k === 'regulation')).toHaveLength(2)
  })

  it('ignores resolution results that arrive after a reset', async () => {
    let release!: () => void
    const slowApi = {
      async resolveLines(lines: DeckLine[], onUpdate: (u: ResolveUpdate[]) => void) {
        await new Promise<void>((r) => (release = r))
        onUpdate(lines.map((l) => ({ key: l.key, status: 'resolved' as const, card: F.charizardObf })))
        return {}
      },
    }
    const deck = createDeckStore(slowApi)
    const pending = deck.importText('1 Charizard ex OBF 125')
    deck.reset()
    release()
    await pending
    expect(deck.lines.value).toEqual([])
    expect(deck.resolving.value).toBe(false)
  })
})
