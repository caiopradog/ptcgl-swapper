<script setup lang="ts">
import { computed, ref } from 'vue'
import DeckInput from './components/DeckInput.vue'
import DeckView from './components/DeckView.vue'
import ExportBar from './components/ExportBar.vue'
import SwapModal from './components/SwapModal.vue'
import { useDeck } from './composables/useDeck'
import type { ExportId } from './lib/printId'
import type { DeckLine, TcgCard } from './types'

const deck = useDeck()
const openKey = ref<string | null>(null)
// Look the line up by key so the modal always sees the latest version (e.g. after resolution).
const openLine = computed<DeckLine | null>(() => deck.lines.value.find((l) => l.key === openKey.value) ?? null)

function onChoose(card: TcgCard, target: ExportId) {
  if (openKey.value) deck.swap(openKey.value, card, target)
  openKey.value = null
}

function onReset() {
  openKey.value = null
  deck.reset()
}
</script>

<template>
  <header class="app-header">
    <h1>PTCGL Deck Swapper</h1>
    <p>Troque a versão das cartas do seu deck do Pokémon TCG Live por impressões equivalentes.</p>
  </header>

  <main class="app-main">
    <DeckInput v-if="!deck.imported.value" @import="deck.importText" />

    <template v-else>
      <ExportBar
        :text="deck.exportText.value"
        :total="deck.totals.value.all"
        :can-undo="deck.canUndo.value"
        @undo="deck.undo"
        @reset="onReset"
      />

      <div v-if="deck.resolving.value" class="banner" role="status">
        <span class="spinner" aria-hidden="true" /> Consultando cartas na API… (pode levar alguns segundos)
      </div>
      <div v-if="deck.resolveError.value" class="banner banner--error" role="alert">
        <span>{{ deck.resolveError.value }}</span>
        <button
          v-if="deck.unresolvedCount.value && !deck.resolving.value"
          type="button"
          class="btn"
          @click="deck.retryUnresolved"
        >
          Tentar novamente
        </button>
      </div>

      <details v-if="deck.issues.value.length" class="panel panel--issues" open>
        <summary>{{ deck.issues.value.length }} linha(s) ignorada(s) ou com problema na importação</summary>
        <ul>
          <li v-for="issue in deck.issues.value" :key="issue.lineNo">
            <span class="lineno">linha {{ issue.lineNo }}</span>
            <code>{{ issue.text }}</code> — {{ issue.reason }}
          </li>
        </ul>
      </details>

      <details v-if="deck.warnings.value.length" class="panel panel--warnings">
        <summary>{{ deck.warnings.value.length }} aviso(s) sobre o deck</summary>
        <ul>
          <li v-for="(w, i) in deck.warnings.value" :key="i" :class="`warn--${w.kind}`">{{ w.message }}</li>
        </ul>
      </details>

      <DeckView :by-section="deck.bySection.value" :totals="deck.totals.value" @open="(line) => (openKey = line.key)" />
    </template>
  </main>

  <SwapModal :line="openLine" @close="openKey = null" @choose="onChoose" />
</template>

<style scoped>
.app-header {
  padding: 22px 20px 8px;
  max-width: 1280px;
  margin: 0 auto;
}
.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
}
.app-header p {
  margin: 4px 0 0;
  color: var(--muted);
}
.app-main {
  padding: 16px 20px 60px;
  max-width: 1280px;
  margin: 0 auto;
}
.banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.banner--error {
  border-color: var(--danger);
  color: var(--danger);
  justify-content: space-between;
}
.panel {
  margin-bottom: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.panel summary {
  cursor: pointer;
  font-weight: 600;
}
.panel--issues {
  border-color: var(--danger);
}
.panel--warnings {
  border-color: var(--warn);
}
.panel ul {
  margin: 10px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}
.lineno {
  color: var(--muted);
  margin-right: 6px;
}
.warn--copies,
.warn--regulation {
  color: var(--warn);
}
.warn--unresolved {
  color: var(--muted);
}
</style>
