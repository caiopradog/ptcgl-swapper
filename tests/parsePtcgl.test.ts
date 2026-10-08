import { describe, expect, it } from 'vitest'
import { parsePtcgl } from '../src/lib/parsePtcgl'
import { exportPtcgl } from '../src/lib/exportPtcgl'

const ENERGY_FIXTURE = `1 Basic {R} Energy MEE 10
1 Basic {D} Energy MEE 7
1 Basic {F} Energy MEE 6
1 Basic {G} Energy MEE 1
1 Basic {L} Energy MEE 4
1 Basic {M} Energy MEE 8
1 Basic {P} Energy MEE 5
1 Basic {W} Energy MEE 3`

const SAMPLE = `Pokémon: 3
2 Charmander PAF 7
1 Charizard ex OBF 125

Trainer: 4
4 Ultra Ball SVI 196

Energy: 2
1 Basic {G} Energy MEE 1
1 Basic {R} Energy MEE 10`

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('parsePtcgl', () => {
  it('parses regular lines into sections', () => {
    const { lines, issues } = parsePtcgl(SAMPLE)
    expect(issues).toEqual([])
    expect(lines).toHaveLength(5)
    expect(lines[0]).toMatchObject({ qty: 2, name: 'Charmander', setCode: 'PAF', number: '7', sectionHint: 'pokemon' })
    expect(lines[1]).toMatchObject({ qty: 1, name: 'Charizard ex', setCode: 'OBF', number: '125' })
    expect(lines[2]).toMatchObject({ qty: 4, name: 'Ultra Ball', sectionHint: 'trainer' })
    expect(lines.every((l) => l.status === 'pending')).toBe(true)
  })

  it('maps every basic energy letter of the real PTCGL fixture', () => {
    const { lines, issues } = parsePtcgl(`Energy: 8\n${ENERGY_FIXTURE}`)
    expect(issues).toEqual([])
    expect(lines.map((l) => [l.energyLetter, l.number])).toEqual([
      ['R', '10'], ['D', '7'], ['F', '6'], ['G', '1'], ['L', '4'], ['M', '8'], ['P', '5'], ['W', '3'],
    ])
    expect(lines.every((l) => l.sectionHint === 'energy' && l.setCode === 'MEE')).toBe(true)
  })

  it('detects basic energy even without a header', () => {
    const { lines } = parsePtcgl('3 Basic {F} Energy SVE 6')
    expect(lines[0]).toMatchObject({ energyLetter: 'F', sectionHint: 'energy' })
  })

  it('does not treat special energies as basic', () => {
    const { lines } = parsePtcgl('Energy: 1\n1 Jet Energy PAL 190')
    expect(lines[0].energyLetter).toBeUndefined()
    expect(lines[0].sectionHint).toBe('energy')
  })

  it('accepts promo codes and leading zeros, preserving the original number', () => {
    const { lines, issues } = parsePtcgl('Pokémon: 2\n1 Pikachu with Grey Felt Hat PR-SV 085\n1 Mew ex PR-SV 53')
    expect(issues).toEqual([])
    expect(lines[0]).toMatchObject({ setCode: 'PR-SV', number: '085' })
    expect(lines[1]).toMatchObject({ setCode: 'PR-SV', number: '53' })
  })

  it('handles names with apostrophes, accents and dots', () => {
    const { lines } = parsePtcgl("Trainer: 3\n1 Boss's Orders PAL 172\n1 Pokémon Catcher SVI 187\n1 Prof. Turo's Scenario PAR 171")
    expect(lines.map((l) => l.name)).toEqual(["Boss's Orders", 'Pokémon Catcher', "Prof. Turo's Scenario"])
  })

  it('reports invalid lines and unknown headers without aborting', () => {
    const text = `Pokémon: 1
1 Charizard ex OBF 125
this is not a card
Sideboard: 0
x Ultra Ball SVI 196
2 Ultra Ball SVI 196
Charizard ex OBF 125`
    const { lines, issues } = parsePtcgl(text)
    expect(lines).toHaveLength(2)
    expect(issues.map((i) => i.lineNo)).toEqual([3, 4, 5, 7])
    expect(issues[1].reason).toMatch(/Cabeçalho desconhecido/)
  })

  it('accepts "Pokemon" without accent, CRLF and a "Total Cards" line', () => {
    const { lines, issues, format } = parsePtcgl('Pokemon: 1\r\n1 Mew ex MEW 151\r\n\r\nTotal Cards: 1\r\n')
    expect(issues).toEqual([])
    expect(format.totalLabel).toBe('Total Cards')
    expect(lines[0]).toMatchObject({ sectionHint: 'pokemon', number: '151' })
  })

  it('reports header totals that do not match, without dropping cards', () => {
    const { lines, issues } = parsePtcgl('Trainer: 2\n4 Ultra Ball SVI 196\n\nEnergy: 8\n1 Basic {G} Energy MEE 1')
    expect(lines).toHaveLength(2)
    expect(issues.map((i) => i.lineNo)).toEqual([1, 4])
    expect(issues[0].reason).toMatch(/\(2\).*\(4\)/)
  })

  it('rejects zero quantity', () => {
    const { lines, issues } = parsePtcgl('0 Mew ex MEW 151')
    expect(lines).toHaveLength(0)
    expect(issues).toHaveLength(1)
  })
})

// List exported in Portuguese, provided by the user: headers count lines, not copies.
const USER_LIST = `Pokémon: 15
2 Latias ex SVALT 221
1 Chi-Yu TWM 39
1 Lillie's Clefairy ex JTG 184
1 Chien-Pao SSP 56
1 Iron Crown ex TEF 191
2 Teal Mask Ogerpon ex TWM 25
4 Mega Kangaskhan ex MEP 25
1 Fezandipiti ex SFA 38
1 Koraidon ex ASC 121
1 Wellspring Mask Ogerpon ex TWM 64
1 Lillie's Clefairy ex JTG 56
3 Meowth ex POR 62
1 Unown 30C 72
1 Iron Leaves ex TEF 213
3 Mew ex 30C 66

Treinador: 10
2 Boss's Orders RCL 189
1 Cyrano SSP 170
1 Unfair Stamp TWM 165
1 Boss's Orders LOR-TG 24
1 Night Stretcher SFA 61
4 Energy Switch SSH 162
4 Ultra Ball BRS 186
4 Area Zero Underdepths SCR 131
3 Crispin SCR 133
1 Ciphermaniac's Codebreaking TEF 145

Energia: 6
1 Basic {F} Energy MEE 14
1 Basic {R} Energy MEE 10
4 Telepathic {P} Energy POR 88
2 Basic {P} Energy MEE 13
5 Basic {G} Energy MEE 9
1 Basic {W} Energy MEE 11

Total de cartas: 60`

describe('Portuguese lists that count lines', () => {
  it('parses the headers, detects line counting and reports nothing', () => {
    const { lines, issues, format } = parsePtcgl(USER_LIST)
    expect(issues).toEqual([])
    expect(lines).toHaveLength(31)
    expect(format).toEqual({
      headers: { pokemon: 'Pokémon', trainer: 'Treinador', energy: 'Energia' },
      countMode: 'lines',
      totalLabel: 'Total de cartas',
    })
    expect(lines.find((l) => l.setCode === 'LOR-TG')).toMatchObject({ number: '24', sectionHint: 'trainer' })
    expect(lines.find((l) => l.name === 'Telepathic {P} Energy')).toMatchObject({ energyLetter: undefined, sectionHint: 'energy' })
  })

  it('round-trips with the same headers, counts and total line', () => {
    const { lines, format } = parsePtcgl(USER_LIST)
    expect(squash(exportPtcgl(lines, format))).toBe(squash(USER_LIST))
  })

  it('keeps counting copies when that is what the headers say', () => {
    expect(parsePtcgl('Treinador: 4\n4 Ultra Ball SVI 196').format.countMode).toBe('cards')
  })
})

describe('exportPtcgl', () => {
  it('round-trips the sample list', () => {
    expect(squash(exportPtcgl(parsePtcgl(SAMPLE).lines))).toBe(squash(SAMPLE))
  })

  it('round-trips the energy fixture', () => {
    const text = `Energy: 8\n${ENERGY_FIXTURE}`
    expect(squash(exportPtcgl(parsePtcgl(text).lines))).toBe(squash(text))
  })

  it('round-trips promos and leading zeros', () => {
    const text = 'Pokémon: 3\n2 Pikachu with Grey Felt Hat PR-SV 085\n1 Mew ex PR-SV 53\n\nTrainer: 1\n1 Boss\'s Orders PAL 172'
    expect(squash(exportPtcgl(parsePtcgl(text).lines))).toBe(squash(text))
  })

  it('orders sections Pokémon → Trainer → Energy and recomputes totals', () => {
    const text = 'Energy: 99\n5 Basic {W} Energy SVE 3\n\nTrainer: 1\n2 Iono PAL 185\n\nPokémon: 1\n3 Mew ex MEW 151'
    expect(exportPtcgl(parsePtcgl(text).lines)).toBe(
      'Pokémon: 3\n3 Mew ex MEW 151\n\nTrainer: 2\n2 Iono PAL 185\n\nEnergy: 5\n5 Basic {W} Energy SVE 3\n',
    )
  })

  it('uses the API supertype over the header hint', () => {
    const { lines } = parsePtcgl('Pokémon: 1\n1 Iono PAL 185')
    lines[0].card = {
      id: 'sv2-185', name: 'Iono', supertype: 'Trainer', number: '185',
      set: { id: 'sv2', name: 'Paldea Evolved', releaseDate: '2023/06/09' }, images: { small: '' },
    }
    expect(exportPtcgl(lines)).toBe('Trainer: 1\n1 Iono PAL 185\n')
  })

  it('always rebuilds basic energy names from the letter', () => {
    const { lines } = parsePtcgl('1 Basic {R} Energy SVE 2')
    lines[0].name = 'Basic Fire Energy' // e.g. after a swap that copied the API name
    expect(exportPtcgl(lines)).toBe('Energy: 1\n1 Basic {R} Energy SVE 2\n')
  })
})
