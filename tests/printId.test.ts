import { describe, expect, it } from 'vitest'
import { apiNumberFor, exportIdFor, galleryOf } from '../src/lib/printId'
import { expandEnergySymbols } from '../src/config/energyTypes'

describe('printId', () => {
  it('recognizes gallery codes', () => {
    expect(galleryOf('LOR-TG')).toEqual({ base: 'LOR', prefix: 'TG' })
    expect(galleryOf('CRZ-GG')).toEqual({ base: 'CRZ', prefix: 'GG' })
    expect(galleryOf('PR-SV')).toBeUndefined()
  })
  it('maps PTCGL numbers to API numbers', () => {
    expect(apiNumberFor('LOR-TG', '24')).toBe('TG24')
    expect(apiNumberFor('LOR-TG', '5')).toBe('TG05')
    expect(apiNumberFor('PR-SV', '085')).toBe('85')
  })
  it('maps API cards back to PTCGL code + number', () => {
    expect(exportIdFor('swsh11tg', 'LOR', 'TG24')).toEqual({ setCode: 'LOR-TG', number: '24' })
    expect(exportIdFor('swsh11tg', 'LOR', 'TG05')).toEqual({ setCode: 'LOR-TG', number: '5' })
    expect(exportIdFor('sv3', 'OBF', '125')).toEqual({ setCode: 'OBF', number: '125' })
    expect(exportIdFor('swshp', 'PR-SW', 'SWSH251')).toEqual({ setCode: 'PR-SW', number: 'SWSH251' })
  })
  it('expands energy symbols in names', () => {
    expect(expandEnergySymbols('Telepathic {P} Energy')).toBe('Telepathic Psychic Energy')
  })
})
