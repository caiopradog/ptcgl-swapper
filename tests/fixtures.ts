import type { TcgCard, TcgSet } from '../src/types'

// Shapes mirror real pokemontcg.io v2 responses (fetched while building the app),
// trimmed to the fields the app selects.

export const SETS: TcgSet[] = [
  { id: 'sve', name: 'Scarlet & Violet Energies', ptcgoCode: 'SVE', releaseDate: '2023/03/31' },
  { id: 'sv1', name: 'Scarlet & Violet', ptcgoCode: 'SVI', releaseDate: '2023/03/31' },
  { id: 'sv2', name: 'Paldea Evolved', ptcgoCode: 'PAL', releaseDate: '2023/06/09' },
  { id: 'sv3', name: 'Obsidian Flames', ptcgoCode: 'OBF', releaseDate: '2023/08/11' },
  { id: 'sv3pt5', name: '151', ptcgoCode: 'MEW', releaseDate: '2023/09/22' },
  { id: 'sv4pt5', name: 'Paldean Fates', ptcgoCode: 'PAF', releaseDate: '2024/01/26' },
  { id: 'svp', name: 'Scarlet & Violet Black Star Promos', ptcgoCode: 'PR-SV', releaseDate: '2023/01/01' },
  { id: 'swsh2', name: 'Rebel Clash', ptcgoCode: 'RCL', releaseDate: '2020/05/01' },
  { id: 'swsh11', name: 'Lost Origin', ptcgoCode: 'LOR', releaseDate: '2022/09/09' },
  { id: 'swsh11tg', name: 'Lost Origin Trainer Gallery', ptcgoCode: 'LOR', releaseDate: '2022/09/09' },
  { id: 'me3', name: 'Perfect Order', ptcgoCode: 'POR', releaseDate: '2026/03/27' },
  { id: 'swsh12', name: 'Silver Tempest', ptcgoCode: 'SIT', releaseDate: '2022/11/11' },
  { id: 'swsh12tg', name: 'Silver Tempest Trainer Gallery', ptcgoCode: 'SIT', releaseDate: '2022/11/11' },
  { id: 'me1', name: 'Mega Evolution', ptcgoCode: 'MEG', releaseDate: '2025/09/26' },
  { id: 'tk1a', name: 'EX Trainer Kit Latias', releaseDate: '2004/06/01' },
]

const setById = (id: string): TcgSet => {
  const set = SETS.find((s) => s.id === id)
  if (!set) throw new Error(`unknown set ${id}`)
  // Cards embed the set object, sometimes without ptcgoCode (seen in the real API).
  return { id: set.id, name: set.name, releaseDate: set.releaseDate }
}

export function card(id: string, name: string, supertype: string, extra: Partial<TcgCard> = {}): TcgCard {
  const [setId, number] = [id.slice(0, id.lastIndexOf('-')), id.slice(id.lastIndexOf('-') + 1)]
  return {
    id,
    name,
    supertype,
    number,
    set: setById(setId),
    images: { small: `https://images.pokemontcg.io/${setId}/${number}.png` },
    ...extra,
  }
}

const ULTRA_BALL_TEXT = 'You can use this card only if you discard 2 other cards from your hand. Search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.'
const ITEM_RULE = 'You may play any number of Item cards during your turn.'

export const ultraBallSvi = card('sv1-196', 'Ultra Ball', 'Trainer', {
  subtypes: ['Item'], regulationMark: 'G', rules: [ULTRA_BALL_TEXT, ITEM_RULE],
})
// Same text split into two items (real API quirk) + typographic apostrophes/extra spaces.
export const ultraBallPaf = card('sv4pt5-91', 'Ultra Ball', 'Trainer', {
  subtypes: ['Item'], regulationMark: 'G',
  rules: [
    'You can use this card only if you discard 2 other cards from your hand.',
    'Search your deck for a Pokémon,  reveal it, and put it into your hand. Then, shuffle your deck.',
    ITEM_RULE,
  ],
})
export const ultraBallMeg = card('me1-131', 'Ultra Ball', 'Trainer', {
  subtypes: ['Item'], regulationMark: 'I', rules: [ULTRA_BALL_TEXT.replace('Pokémon', 'Pokemon'), ITEM_RULE],
})
// Old wording: still listed as an alternative (trainer text is not compared).
export const ultraBallOld = card('swsh12-150', 'Ultra Ball', 'Trainer', {
  subtypes: ['Item'], rules: ["Discard 2 cards from your hand. (If you can't discard 2 cards, you can't play this card.) Search your deck for a Pokémon, reveal it, and put it into your hand. Shuffle your deck afterward.", ITEM_RULE],
})
// Same name, different subtype.
export const ultraBallAceSpec = card('sv3-200', 'Ultra Ball', 'Trainer', {
  subtypes: ['Item', 'ACE SPEC'], rules: [ULTRA_BALL_TEXT, ITEM_RULE],
})

const charizardBase: Partial<TcgCard> = {
  subtypes: ['Stage 2', 'ex', 'Tera'],
  hp: '330',
  types: ['Darkness'],
  abilities: [{ name: 'Infernal Reign', type: 'Ability', text: 'When you play this Pokémon from your hand to evolve 1 of your Pokémon during your turn, you may search your deck for up to 3 Basic Fire Energy cards and attach them to your Pokémon in any way you like. Then, shuffle your deck.' }],
  attacks: [{ name: 'Burning Darkness', cost: ['Fire', 'Fire'], convertedEnergyCost: 2, damage: '180+', text: 'This attack does 30 more damage for each Prize card your opponent has taken.' }],
  weaknesses: [{ type: 'Grass', value: '×2' }],
  retreatCost: ['Colorless', 'Colorless'],
  regulationMark: 'G',
}
export const charizardObf = card('sv3-125', 'Charizard ex', 'Pokémon', charizardBase)
export const charizardObfSir = card('sv3-223', 'Charizard ex', 'Pokémon', charizardBase)
export const charizardPaf = card('sv4pt5-54', 'Charizard ex', 'Pokémon', {
  ...charizardBase,
  // Cosmetic differences only: "x2" vs "×2", typographic apostrophe.
  weaknesses: [{ type: 'Grass', value: 'x2' }],
})
// Same name, different attack → not equivalent.
export const charizardMew = card('sv3pt5-6', 'Charizard ex', 'Pokémon', {
  subtypes: ['Stage 2', 'ex'], hp: '330', types: ['Fire'],
  attacks: [
    { name: 'Brave Wing', cost: ['Fire'], damage: '60+', text: 'If this Pokémon has any damage counters on it, this attack does 100 more damage.' },
    { name: 'Explosive Vortex', cost: ['Fire', 'Fire', 'Fire', 'Fire'], damage: '330', text: 'Discard 3 Energy from this Pokémon.' },
  ],
  weaknesses: [{ type: 'Water', value: '×2' }],
  retreatCost: ['Colorless', 'Colorless'],
  regulationMark: 'G',
})
export const charizardPromoDiffAttack = card('svp-56', 'Charizard ex', 'Pokémon', {
  ...charizardBase,
  attacks: [{ name: 'Burning Darkness', cost: ['Fire', 'Fire'], damage: '200+', text: 'This attack does 30 more damage for each Prize card your opponent has taken.' }],
})
export const charizardOldEx = card('tk1a-10', 'Charizard ex', 'Pokémon', { hp: '160', types: ['Fire'] })

export const fireEnergySve = card('sve-2', 'Basic Fire Energy', 'Energy', { subtypes: ['Basic'] })
export const fireEnergySveHolo = card('sve-10', 'Basic Fire Energy', 'Energy', { subtypes: ['Basic'] })
export const fireEnergyObf = card('sv3-230', 'Basic Fire Energy', 'Energy', { subtypes: ['Basic'], regulationMark: 'G' })
export const fireEnergyOld = card('swsh12-153', 'Fire Energy', 'Energy', { subtypes: ['Basic'] })
export const fightingEnergySve = card('sve-6', 'Basic Fighting Energy', 'Energy', { subtypes: ['Basic'] })
export const darknessEnergySve = card('sve-7', 'Basic Darkness Energy', 'Energy', { subtypes: ['Basic'] })
export const fireEnergyNoCode = card('tk1a-10', 'Fire Energy', 'Energy', { subtypes: ['Basic'] })

export const ALL_BASIC_ENERGY = [
  fireEnergySve, fireEnergySveHolo, fireEnergyObf, fireEnergyOld, fightingEnergySve, darknessEnergySve, fireEnergyNoCode,
]

// Real wording change between eras (confirmed in the API).
const BOSS_OLD = "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon."
const BOSS_NEW = "Switch in 1 of your opponent's Benched Pokémon to the Active Spot."
const SUPPORTER_RULE = 'You may play only 1 Supporter card during your turn.'
export const bossRcl = card('swsh2-189', "Boss's Orders", 'Trainer', {
  subtypes: ['Supporter'], regulationMark: 'D', rules: [BOSS_OLD, SUPPORTER_RULE],
})
export const bossLorTg = card('swsh11tg-TG24', "Boss's Orders", 'Trainer', {
  subtypes: ['Supporter'], regulationMark: 'D', rules: [BOSS_OLD, SUPPORTER_RULE],
})
export const bossMeg = card('me1-114', "Boss's Orders", 'Trainer', {
  subtypes: ['Supporter'], regulationMark: 'I', rules: [BOSS_NEW, SUPPORTER_RULE],
})
export const telepathicPor = card('me3-88', 'Telepathic Psychic Energy', 'Energy', {
  subtypes: ['Special'], regulationMark: 'I', rules: ['Provides Psychic Energy.'],
})
