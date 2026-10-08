<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ import: [text: string] }>()
const text = ref('')

const PLACEHOLDER = `Pokémon: 3
2 Charmander PAF 7
1 Charizard ex OBF 125

Trainer: 4
4 Ultra Ball SVI 196

Energy: 2
1 Basic {G} Energy MEE 1
1 Basic {R} Energy MEE 10`

function submit() {
  if (text.value.trim()) emit('import', text.value)
}
</script>

<template>
  <form class="input" @submit.prevent="submit">
    <label for="deck-text">Cole aqui a lista exportada do Pokémon TCG Live</label>
    <textarea
      id="deck-text"
      v-model="text"
      :placeholder="PLACEHOLDER"
      spellcheck="false"
      autocomplete="off"
      @keydown.ctrl.enter="submit"
      @keydown.meta.enter="submit"
    />
    <div class="input__actions">
      <small>Dica: Ctrl+Enter também importa.</small>
      <button type="submit" class="btn btn--primary" :disabled="!text.trim()">Importar</button>
    </div>
  </form>
</template>

<style scoped>
.input {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 820px;
  margin: 0 auto;
}
label {
  font-weight: 600;
}
textarea {
  min-height: 55vh;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: 0.95rem/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  resize: vertical;
}
textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.input__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
small {
  color: var(--muted);
}
</style>
