<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ text: string; total: number; canUndo: boolean }>()
const emit = defineEmits<{ undo: []; reset: [] }>()

const status = ref('')
let statusTimer: ReturnType<typeof setTimeout> | undefined

function flash(message: string) {
  status.value = message
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => (status.value = ''), 2500)
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
    flash('Lista copiada!')
  } catch {
    // Fallback for non-secure contexts.
    const area = document.createElement('textarea')
    area.value = props.text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    flash(ok ? 'Lista copiada!' : 'Não foi possível copiar; use "Baixar .txt".')
  }
}

function download() {
  const blob = new Blob([props.text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'deck-ptcgl.txt'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="bar" role="toolbar" aria-label="Ações do deck">
    <span class="bar__total" :class="{ 'bar__total--off': total !== 60 }">{{ total }} cartas</span>
    <div class="bar__actions">
      <button type="button" class="btn" :disabled="!canUndo" @click="emit('undo')">Desfazer</button>
      <button type="button" class="btn" @click="emit('reset')">Nova lista</button>
      <button type="button" class="btn" @click="download">Baixar .txt</button>
      <button type="button" class="btn btn--primary" @click="copy">Copiar lista</button>
    </div>
    <span class="bar__status" role="status" aria-live="polite">{{ status }}</span>
  </div>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 10px 14px;
  margin-bottom: 18px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.25);
}
.bar__total {
  font-weight: 700;
}
.bar__total--off {
  color: var(--warn);
}
.bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.bar__status {
  flex-basis: 100%;
  text-align: right;
  font-size: 0.85rem;
  color: var(--ok);
  min-height: 0;
}
.bar__status:empty {
  display: none;
}
</style>
