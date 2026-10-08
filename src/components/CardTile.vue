<script setup lang="ts">
import { computed } from 'vue'
import { isLegalMark } from '../config/legalMarks'
import type { TcgCard } from '../types'

const props = withDefaults(
  defineProps<{
    card?: TcgCard
    /** Text shown on the grey placeholder when there is no card data. */
    fallbackText?: string
    /** PTCGL code + number ("OBF 125", "LOR-TG 24"), shown in the tooltip. */
    ptcgoLabel?: string
    qty?: number
    current?: boolean
    pending?: boolean
    approximate?: boolean
    /** Basic energy is always legal, so its mark is never highlighted. */
    ignoreMark?: boolean
    clickable?: boolean
  }>(),
  { clickable: false },
)

const emit = defineEmits<{ select: [] }>()

const mark = computed(() => props.card?.regulationMark ?? '—')
const markIllegal = computed(() => !!props.card && !props.ignoreMark && !isLegalMark(props.card.regulationMark))
const tooltip = computed(() => {
  const parts: string[] = []
  if (props.ptcgoLabel) parts.push(`PTCGL: ${props.ptcgoLabel}`)
  if (props.card) parts.push(`${props.card.set.name} (${props.card.set.releaseDate})`)
  if (props.approximate) parts.push('Impressão exata não encontrada; exibindo outra versão de mesmo nome.')
  return parts.join('\n') || undefined
})
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="tile"
    :class="{ 'tile--clickable': clickable, 'tile--current': current, 'tile--missing': !card && !pending }"
    @click="clickable && emit('select')"
  >
    <div class="tile__art" :title="tooltip">
      <img v-if="card" :src="card.images.small" :alt="card.name" loading="lazy" />
      <div v-else-if="pending" class="tile__placeholder"><span class="spinner" aria-hidden="true" /></div>
      <div v-else class="tile__placeholder tile__placeholder--missing">
        <span>{{ fallbackText }}</span>
        <small>não encontrada</small>
      </div>
      <span v-if="qty !== undefined" class="badge badge--qty" :aria-label="`${qty} cópias`">{{ qty }}×</span>
      <span v-if="current" class="badge badge--current">Atual</span>
      <span v-if="approximate" class="badge badge--approx" aria-label="versão aproximada">≈</span>
    </div>
    <div class="tile__info">
      <strong class="tile__name">{{ card?.name ?? fallbackText }}</strong>
      <span class="tile__meta">
        <span v-if="card">{{ card.set.id }} · #{{ card.number }}</span>
        <span v-else>{{ ptcgoLabel ?? '' }}</span>
        <span
          class="mark"
          :class="{ 'mark--illegal': markIllegal }"
          :title="markIllegal ? 'Marca de regulamento fora da lista de legais' : 'Marca de regulamento'"
        >{{ mark }}</span>
      </span>
    </div>
  </component>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  text-align: left;
  min-width: 0;
}
.tile--clickable {
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease;
}
.tile--clickable:hover,
.tile--clickable:focus-visible {
  transform: translateY(-2px);
  border-color: var(--accent);
  outline: none;
}
.tile--current {
  border-color: var(--ok);
}
.tile__art {
  position: relative;
  aspect-ratio: 63 / 88;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
}
.tile__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tile__placeholder {
  height: 100%;
  display: grid;
  place-items: center;
}
.tile__placeholder--missing {
  align-content: center;
  gap: 6px;
  padding: 8px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--muted);
  background: repeating-linear-gradient(45deg, var(--surface-2), var(--surface-2) 8px, var(--surface-3) 8px, var(--surface-3) 16px);
  word-break: break-word;
}
.tile__placeholder--missing small {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.65rem;
}
.tile__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tile__name {
  font-size: 0.85rem;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--muted);
}
.mark {
  min-width: 1.4em;
  padding: 0 4px;
  border-radius: 4px;
  text-align: center;
  font-weight: 700;
  background: var(--surface-3);
  color: var(--text);
}
.mark--illegal {
  background: var(--danger);
  color: #fff;
}
.badge {
  position: absolute;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
}
.badge--qty {
  top: 6px;
  left: 6px;
  background: var(--accent);
  color: #fff;
}
.badge--current {
  top: 6px;
  right: 6px;
  background: var(--ok);
  color: #fff;
}
.badge--approx {
  bottom: 6px;
  right: 6px;
  background: var(--warn);
  color: #000;
}
</style>
