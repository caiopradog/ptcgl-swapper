import { describe, expect, it } from 'vitest'
import {
  energyAlternatives, energyLetterOf, isPokemonEquivalent, pokemonAlternatives,
  sortByRelease, trainerAlternatives,
} from '../src/lib/equivalence'
import { escapeLucenePhrase, normalizeNumber, normalizeText } from '../src/lib/normalize'
import { letterFromApiName } from '../src/config/energyTypes'
import * as F from './fixtures'

const ids = (cards: { id: string }[]) => cards.map((c) => c.id)

describe('normalize', () => {
  it('lowercases, strips accents, unifies quotes and collapses spaces', () => {
    expect(normalizeText('  Boss’s   Orders ')).toBe("boss's orders")
    expect(normalizeText('Pokémon Catcher')).toBe('pokemon catcher')
    expect(normalizeText('“Quoted”')).toBe('"quoted"')
  })
  it('normalizes card numbers', () => {
    expect(normalizeNumber('007')).toBe('7')
    expect(normalizeNumber('085')).toBe('85')
    expect(normalizeNumber('TG07')).toBe('TG7')
    expect(normalizeNumber('0')).toBe('0')
  })
  it('escapes phrases for Lucene queries', () => {
    expect(escapeLucenePhrase('Boss’s Orders')).toBe("Boss's Orders")
    expect(escapeLucenePhrase('a "b" \\c')).toBe('a \\"b\\" \\\\c')
    expect(escapeLucenePhrase('Pokémon Catcher')).toBe('Pokémon Catcher')
  })
})

describe('basic energy type detection', () => {
  it('accepts both API naming styles', () => {
    expect(letterFromApiName('Fire Energy')).toBe('R')
    expect(letterFromApiName('Basic Fire Energy')).toBe('R')
    expect(letterFromApiName('Basic Fighting Energy')).toBe('F')
    expect(letterFromApiName('Darkness Energy')).toBe('D')
    expect(letterFromApiName('Metal Energy')).toBe('M')
    expect(letterFromApiName('Fairy Energy')).toBeUndefined()
    expect(letterFromApiName('Jet Energy')).toBeUndefined()
  })
  it('only treats Basic-subtype energy cards as basic', () => {
    expect(energyLetterOf(F.fireEnergyOld)).toBe('R')
    expect(energyLetterOf(F.card('sv2-190', 'Jet Energy', 'Energy', { subtypes: ['Special'] }))).toBeUndefined()
  })
  it('lists other arts of the same type, newest first, even without a current card', () => {
    const alts = energyAlternatives(F.ALL_BASIC_ENERGY, 'R')
    expect(ids(alts.equivalent)).toEqual(['sv3-230', 'sve-2', 'sve-10', 'swsh12-153', 'tk1a-10'])
    expect(alts.nonEquivalent).toEqual([])
  })
  it('keeps Fire ({R}) and Fighting ({F}) apart', () => {
    expect(ids(energyAlternatives(F.ALL_BASIC_ENERGY, 'F').equivalent)).toEqual(['sve-6'])
  })
})

describe('trainer alternatives', () => {
  it('keeps every same-name print, whatever the text, and excludes other names', () => {
    const other = F.card('sv2-172', "Boss's Orders", 'Trainer', { subtypes: ['Supporter'], rules: F.ultraBallSvi.rules })
    const alts = trainerAlternatives(F.ultraBallSvi, [
      F.ultraBallOld, F.ultraBallPaf, F.ultraBallMeg, F.ultraBallAceSpec, other,
    ])
    // Current card is always included (marked "Atual" in the UI).
    expect(ids(alts.equivalent)).toEqual(['me1-131', 'sv4pt5-91', 'sv3-200', 'sv1-196', 'swsh12-150'])
    expect(alts.nonEquivalent).toEqual([])
  })

  it("lists Boss's Orders from every era together", () => {
    const alts = trainerAlternatives(F.bossRcl, [F.bossMeg, F.bossLorTg, F.bossRcl])
    expect(ids(alts.equivalent)).toEqual(['me1-114', 'swsh11tg-TG24', 'swsh2-189'])
  })
})

describe('pokémon equivalence', () => {
  it('is equivalent when only cosmetic text differs', () => {
    expect(isPokemonEquivalent(F.charizardObf, F.charizardObfSir)).toBe(true)
    expect(isPokemonEquivalent(F.charizardObf, F.charizardPaf)).toBe(true)
  })
  it('is not equivalent with a different attack', () => {
    expect(isPokemonEquivalent(F.charizardObf, F.charizardMew)).toBe(false)
    expect(isPokemonEquivalent(F.charizardObf, F.charizardPromoDiffAttack)).toBe(false)
  })
  it('splits same-name prints into equivalent / non-equivalent, newest first', () => {
    const alts = pokemonAlternatives(F.charizardObf, [
      F.charizardOldEx, F.charizardMew, F.charizardObfSir, F.charizardPaf, F.charizardPromoDiffAttack,
    ])
    expect(ids(alts.equivalent)).toEqual(['sv4pt5-54', 'sv3-125', 'sv3-223'])
    expect(ids(alts.nonEquivalent)).toEqual(['sv3pt5-6', 'svp-56', 'tk1a-10'])
  })
})

describe('sortByRelease', () => {
  it('sorts newest set first, then set id, then numeric card number', () => {
    const a = F.card('sv3-230', 'x', 'Energy')
    const b = F.card('sv3-23', 'x', 'Energy')
    const c = F.card('me1-1', 'x', 'Energy')
    expect(ids(sortByRelease([a, b, c]))).toEqual(['me1-1', 'sv3-23', 'sv3-230'])
  })
})
