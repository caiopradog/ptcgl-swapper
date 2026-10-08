<script setup lang="ts">
import type { DeckLine, Section } from '../types'
import CardTile from './CardTile.vue'

defineProps<{
  bySection: Record<Section, DeckLine[]>
  totals: Record<Section, number>
}>()

const emit = defineEmits<{ open: [line: DeckLine] }>()

const SECTIONS: { id: Section; title: string }[] = [
  { id: 'pokemon', title: 'Pokémon' },
  { id: 'trainer', title: 'Treinador' },
  { id: 'energy', title: 'Energia' },
]

function lineText(line: DeckLine) {
  return `${line.name} ${line.setCode} ${line.number}`
}
</script>

<template>
  <div class="deck">
    <section v-for="s in SECTIONS" :key="s.id" class="deck__section" :aria-labelledby="`sec-${s.id}`">
      <h2 :id="`sec-${s.id}`">
        {{ s.title }} <span class="count">{{ totals[s.id] }}</span>
      </h2>
      <p v-if="!bySection[s.id].length" class="empty">Nenhuma carta.</p>
      <div v-else class="grid">
        <CardTile
          v-for="line in bySection[s.id]"
          :key="line.key"
          :card="line.card"
          :qty="line.qty"
          :fallback-text="lineText(line)"
          :ptcgo-label="`${line.setCode} ${line.number}`"
          :pending="line.status === 'pending'"
          :approximate="line.approximate"
          :ignore-mark="!!line.energyLetter"
          clickable
          :label="`Trocar ${line.qty}× ${lineText(line)}`"
          @select="emit('open', line)"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.deck {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
h2 {
  margin: 0 0 12px;
  font-size: 1.15rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.count {
  font-size: 0.85rem;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-3);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.empty {
  color: var(--muted);
  margin: 0;
}
</style>
