<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useFavorites } from '../composables/useFavorites'
import { ENERGY_TYPE_LABEL_PT } from '../config/energyTypes'
import { favoriteKeyForCard } from '../lib/favorites'
import { findAlternatives, type AlternativesResult } from '../services/alternatives'
import { friendlyError } from '../services/http'
import type { ExportId } from '../lib/printId'
import type { DeckLine, TcgCard } from '../types'
import CardTile from './CardTile.vue'

const props = defineProps<{ line: DeckLine | null }>()
const emit = defineEmits<{ close: []; choose: [card: TcgCard, target: ExportId] }>()

const favorites = useFavorites()

const dialog = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<AlternativesResult | null>(null)
let restoreFocus: HTMLElement | null = null
let requestId = 0

// An approximate card is another print, so it is not "the" card in the deck.
const currentId = computed(() => (props.line && !props.line.approximate ? props.line.card?.id : undefined))
const lineLabel = computed(() => (props.line ? `${props.line.setCode} ${props.line.number}` : ''))
const lineText = computed(() => (props.line ? `${props.line.name} ${props.line.setCode} ${props.line.number}` : ''))
const title = computed(() => {
  const line = props.line
  if (!line) return ''
  if (line.energyLetter) return `Trocar arte: Energia de ${ENERGY_TYPE_LABEL_PT[line.energyLetter]}`
  return `Trocar versão: ${line.card?.name ?? line.name}`
})
const hasAny = computed(() => !!result.value && result.value.equivalent.length + result.value.nonEquivalent.length > 0)
const onlyCurrent = computed(
  () =>
    !!result.value &&
    result.value.nonEquivalent.length === 0 &&
    result.value.equivalent.every((c) => c.id === currentId.value),
)

async function load() {
  const line = props.line
  if (!line) return
  const id = ++requestId
  loading.value = true
  error.value = null
  result.value = null
  try {
    const res = await findAlternatives(line)
    if (id === requestId) result.value = res
  } catch (err) {
    if (id === requestId) error.value = friendlyError(err)
  } finally {
    if (id === requestId) loading.value = false
  }
}

function exportLabel(card: TcgCard): string | undefined {
  const id = result.value?.exportIds.get(card.id)
  return id && `${id.setCode} ${id.number}`
}

function favoriteKey(card: TcgCard) {
  return result.value ? favoriteKeyForCard(card, result.value.kind) : undefined
}

/** Only cards that can be exported (and grouped) can be favorites. */
function canFavorite(card: TcgCard): boolean {
  return !!favoriteKey(card) && !!result.value?.exportIds.get(card.id)
}

function toggleFavorite(card: TcgCard) {
  const key = favoriteKey(card)
  const target = result.value?.exportIds.get(card.id)
  if (key && target) favorites.toggle(key, card, target)
}

function pick(card: TcgCard) {
  if (card.id === currentId.value) {
    emit('close')
    return
  }
  const target = result.value?.exportIds.get(card.id)
  if (target) emit('choose', card, target)
}

function focusables(): HTMLElement[] {
  if (!dialog.value) return []
  return [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'Tab') {
    const items = focusables()
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => props.line,
  async (line, previous) => {
    if (line && !previous) {
      restoreFocus = document.activeElement as HTMLElement | null
      document.body.style.overflow = 'hidden'
      await nextTick()
      closeButton.value?.focus()
    } else if (!line && previous) {
      document.body.style.overflow = ''
      restoreFocus?.focus()
      restoreFocus = null
    }
    if (line && line.key !== previous?.key) load()
  },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="line" class="backdrop" @click.self="emit('close')">
      <div
        ref="dialog"
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-title"
        @keydown="onKeydown"
      >
        <header class="modal__header">
          <h2 id="swap-title">{{ title }}</h2>
          <button ref="closeButton" type="button" class="btn btn--icon" aria-label="Fechar" @click="emit('close')">✕</button>
        </header>

        <div class="modal__body">
          <div class="current">
            <CardTile
              class="current__tile"
              :card="line.card"
              :fallback-text="lineText"
              :ptcgo-label="lineLabel"
              :qty="line.qty"
              :approximate="line.approximate"
              :ignore-mark="!!line.energyLetter"
            />
            <div class="current__text">
              <p><strong>No deck:</strong> {{ line.qty }}× {{ lineText }}</p>
              <p class="muted">
                Escolha uma versão abaixo para trocar
                <strong>{{ line.qty === 1 ? 'esta cópia' : `todas as ${line.qty} cópias` }}</strong>.
                Fechar sem escolher não altera o deck.
              </p>
              <p v-if="line.approximate" class="note note--warn">
                A impressão exata não foi encontrada na API; a imagem é de outra versão com o mesmo nome.
              </p>
            </div>
          </div>

          <div v-if="loading" class="state" role="status">
            <span class="spinner" aria-hidden="true" /> Buscando alternativas…
          </div>
          <div v-else-if="error" class="state state--error" role="alert">
            <p>{{ error }}</p>
            <button type="button" class="btn" @click="load">Tentar novamente</button>
          </div>
          <template v-else-if="result">
            <p v-if="result.notice" class="state">{{ result.notice }}</p>
            <p v-else-if="!hasAny || onlyCurrent" class="state">Nenhuma outra versão equivalente encontrada.</p>

            <section v-if="result.equivalent.length && !onlyCurrent" aria-labelledby="eq-title">
              <h3 v-if="result.kind === 'pokemon'" id="eq-title">Equivalentes <span class="count">{{ result.equivalent.length }}</span></h3>
              <h3 v-else id="eq-title" class="sr-only">Alternativas</h3>
              <div class="grid">
                <CardTile
                  v-for="card in result.equivalent"
                  :key="card.id"
                  :card="card"
                  :ptcgo-label="exportLabel(card)"
                  :current="card.id === currentId"
                  :ignore-mark="result.kind === 'energy'"
                  :favoritable="canFavorite(card)"
                  :favorite="favorites.isFavorite(favoriteKey(card), card.id)"
                  clickable
                  @select="pick(card)"
                  @toggle-favorite="toggleFavorite(card)"
                />
              </div>
            </section>

            <section v-if="result.kind === 'pokemon' && result.nonEquivalent.length" class="non-eq" aria-labelledby="neq-title">
              <h3 id="neq-title">Não equivalentes <span class="count">{{ result.nonEquivalent.length }}</span></h3>
              <p class="note note--danger">
                ⚠ Mesmo nome, mas com <strong>efeito diferente</strong> (HP, ataques, habilidades, fraqueza, resistência ou recuo).
                Trocar por uma destas muda como a carta joga.
              </p>
              <div class="grid">
                <CardTile
                  v-for="card in result.nonEquivalent"
                  :key="card.id"
                  :card="card"
                  :ptcgo-label="exportLabel(card)"
                  :current="card.id === currentId"
                  :favoritable="canFavorite(card)"
                  :favorite="favorites.isFavorite(favoriteKey(card), card.id)"
                  clickable
                  @select="pick(card)"
                  @toggle-favorite="toggleFavorite(card)"
                />
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.7);
}
.modal {
  width: min(1000px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.5);
}
.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.modal__header h2 {
  margin: 0;
  font-size: 1.1rem;
}
.modal__body {
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.current {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.current__tile {
  width: 150px;
  flex-shrink: 0;
}
.current__text p {
  margin: 0 0 8px;
}
h3 {
  margin: 0 0 10px;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.count {
  font-size: 0.8rem;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-3);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}
.non-eq {
  padding: 14px;
  border: 2px dashed var(--danger);
  border-radius: 12px;
  background: var(--danger-bg);
}
.non-eq h3 {
  color: var(--danger);
}
.state {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  margin: 0;
}
.state--error {
  flex-direction: column;
  align-items: flex-start;
  color: var(--danger);
}
.state--error p {
  margin: 0;
}
.muted {
  color: var(--muted);
}
@media (max-width: 520px) {
  .current {
    flex-direction: column;
  }
}
</style>
