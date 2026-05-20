<template>
  <div class="html-visual-editor">
    <aside class="html-block-sidebar">
      <div class="html-history-toolbar">
        <button class="btn-ghost btn-sm" :disabled="!canUndo" @click="undo">Undo</button>
        <button class="btn-ghost btn-sm" :disabled="!canRedo" @click="redo">Redo</button>
      </div>
      <div class="html-panel-title">Add block</div>
      <button
        v-for="block in blockTypes"
        :key="block.type"
        class="html-block-btn"
        @click="addBlock(block.type)"
      >
        {{ block.label }}
      </button>
    </aside>

    <section class="html-visual-panel">
      <div class="html-panel-title">Structure</div>
      <div class="html-structure-list">
        <button
          v-for="(block, index) in parsed.blocks"
          :key="block.id"
          class="html-structure-item"
          :class="{ active: selectedBlock?.id === block.id }"
          @click="selectedId = block.id"
        >
          <span>{{ blockLabel(block) }}</span>
          <small>{{ index + 1 }}</small>
        </button>
      </div>

      <template v-if="selectedBlock">
        <div class="html-block-actions">
          <button class="btn-ghost btn-sm" :disabled="selectedIndex <= 0" @click="moveSelected(-1)">Up</button>
          <button class="btn-ghost btn-sm" :disabled="selectedIndex >= parsed.blocks.length - 1" @click="moveSelected(1)">Down</button>
          <button class="btn-ghost btn-sm" @click="duplicateSelected">Duplicate</button>
          <button class="btn-ghost btn-sm danger" @click="deleteSelected">Delete</button>
        </div>

        <div class="html-panel-title">Content</div>
        <div class="html-property-grid">
          <label v-if="selectedBlock.type === 'heading'">
            <span>Level</span>
            <select :value="selectedBlock.level || 2" @change="updateSelected({ level: Number(($event.target as HTMLSelectElement).value) })">
              <option v-for="level in [1,2,3,4,5,6]" :key="level" :value="level">H{{ level }}</option>
            </select>
          </label>

          <label v-if="hasTextField(selectedBlock.type)">
            <span>Text</span>
            <input :value="selectedBlock.text || ''" @input="updateSelected({ text: ($event.target as HTMLInputElement).value })" />
          </label>

          <label v-if="selectedBlock.type === 'section' || selectedBlock.type === 'card'">
            <span>Body</span>
            <textarea :value="selectedBlock.body || ''" @input="updateSelected({ body: ($event.target as HTMLTextAreaElement).value })"></textarea>
          </label>

          <label v-if="selectedBlock.type === 'list'">
            <span>Items</span>
            <textarea :value="(selectedBlock.items || []).join('\n')" @input="updateSelected({ items: ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean) })"></textarea>
          </label>

          <label v-if="selectedBlock.type === 'list'" class="html-checkbox-row">
            <input type="checkbox" :checked="!!selectedBlock.ordered" @change="updateSelected({ ordered: ($event.target as HTMLInputElement).checked })" />
            <span>Ordered list</span>
          </label>

          <label v-if="selectedBlock.type === 'link' || selectedBlock.type === 'button'">
            <span>Href</span>
            <input :value="selectedBlock.href || ''" @input="updateSelected({ href: ($event.target as HTMLInputElement).value })" />
          </label>

          <label v-if="selectedBlock.type === 'image'">
            <span>Image URL</span>
            <input :value="selectedBlock.src || ''" @input="updateSelected({ src: ($event.target as HTMLInputElement).value })" />
          </label>

          <label v-if="selectedBlock.type === 'image'">
            <span>Alt text</span>
            <input :value="selectedBlock.alt || ''" @input="updateSelected({ alt: ($event.target as HTMLInputElement).value })" />
          </label>

          <label v-if="selectedBlock.type === 'image'">
            <span>Caption</span>
            <input :value="selectedBlock.caption || ''" @input="updateSelected({ caption: ($event.target as HTMLInputElement).value })" />
          </label>

          <label v-if="selectedBlock.type === 'raw'">
            <span>Raw HTML</span>
            <textarea :value="selectedBlock.rawHtml || ''" readonly></textarea>
          </label>
        </div>

        <div class="html-panel-title">Style</div>
        <div class="html-property-grid html-style-grid">
          <label v-for="control in styleControls" :key="control.property">
            <span>{{ control.label }}</span>
            <input
              :value="styleValue(selectedBlock, control.property)"
              :placeholder="control.placeholder"
              @input="updateStyle(control.property, ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </template>
    </section>

    <iframe
      class="html-browser-preview"
      :srcdoc="previewHtml"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createBlock,
  duplicateBlock,
  parseVisualHtml,
  serializeVisualHtml,
  setBlockStyleProperty,
  type ParsedVisualHtml,
  type VisualBlock,
  type VisualBlockType,
} from '../../html/visualHtml';
import { createHistory } from '../../html/visualHtmlHistory';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();

const blockTypes: { type: VisualBlockType; label: string }[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'section', label: 'Section' },
  { type: 'card', label: 'Card' },
  { type: 'list', label: 'List' },
  { type: 'button', label: 'Button' },
  { type: 'link', label: 'Link' },
  { type: 'image', label: 'Image' },
];

const styleControls = [
  { property: 'padding', label: 'Padding', placeholder: '24px' },
  { property: 'margin', label: 'Margin', placeholder: '0 0 16px' },
  { property: 'font-size', label: 'Font size', placeholder: '18px' },
  { property: 'font-weight', label: 'Weight', placeholder: '600' },
  { property: 'color', label: 'Text color', placeholder: '#111827' },
  { property: 'text-align', label: 'Align', placeholder: 'left' },
  { property: 'background', label: 'Background', placeholder: '#f8fafc' },
  { property: 'border-color', label: 'Border', placeholder: '#e5e7eb' },
  { property: 'border-radius', label: 'Radius', placeholder: '8px' },
  { property: 'max-width', label: 'Max width', placeholder: '720px' },
];

const parsed = ref<ParsedVisualHtml>(parseVisualHtml(props.modelValue));
const selectedId = ref(parsed.value.blocks[0]?.id || '');
const syncingFromSelf = ref(false);

const canUndo = ref(false);
const canRedo = ref(false);

const history = (() => {
  const inner = createHistory<string>(props.modelValue || '');
  return {
    record(value: string) {
      inner.record(value);
      canUndo.value = true;
      canRedo.value = false;
    },
    undo(): string | undefined {
      const value = inner.undo();
      if (value === undefined) {
        canUndo.value = false;
      } else {
        canRedo.value = true;
      }
      return value;
    },
    redo(): string | undefined {
      const value = inner.redo();
      if (value === undefined) {
        canRedo.value = false;
      } else {
        canUndo.value = true;
      }
      return value;
    },
    reset(value: string) {
      inner.reset(value);
      canUndo.value = false;
      canRedo.value = false;
    },
  };
})();

const selectedIndex = computed(() => parsed.value.blocks.findIndex((block) => block.id === selectedId.value));
const selectedBlock = computed(() => parsed.value.blocks[selectedIndex.value] || parsed.value.blocks[0]);
const previewHtml = computed(() => serializeVisualHtml(parsed.value));

watch(() => props.modelValue, (value) => {
  if (syncingFromSelf.value) {
    syncingFromSelf.value = false;
    return;
  }
  parsed.value = parseVisualHtml(value);
  selectedId.value = parsed.value.blocks[0]?.id || '';
  history.reset(value || '');
});

function emitHtml(record = true) {
  syncingFromSelf.value = true;
  const html = serializeVisualHtml(parsed.value);
  if (record) history.record(html);
  emit('update:modelValue', html);
}

function addBlock(type: VisualBlockType) {
  const block = createBlock(type, defaultBlockInput(type));
  parsed.value.blocks.push(block);
  selectedId.value = block.id;
  emitHtml();
}

function defaultBlockInput(type: VisualBlockType): Partial<VisualBlock> {
  if (type === 'heading') return { text: 'Heading', level: 2 };
  if (type === 'paragraph') return { text: 'Paragraph text' };
  if (type === 'section') return { text: 'Section title', body: '<p>Section content</p>' };
  if (type === 'card') return { text: 'Card title', body: 'Card body' };
  if (type === 'list') return { items: ['First item', 'Second item'] };
  if (type === 'button') return { text: 'Button', href: '#' };
  if (type === 'link') return { text: 'Link', href: '#' };
  if (type === 'image') return { src: '', alt: '', caption: '' };
  return { rawHtml: '<div></div>' };
}

function updateSelected(patch: Partial<VisualBlock>) {
  const index = selectedIndex.value;
  const current = parsed.value.blocks[index];
  if (index < 0 || !current) return;
  parsed.value.blocks[index] = {
    ...current,
    ...patch,
  };
  emitHtml();
}

function moveSelected(direction: number) {
  const index = selectedIndex.value;
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= parsed.value.blocks.length) return;
  const [block] = parsed.value.blocks.splice(index, 1);
  if (!block) return;
  parsed.value.blocks.splice(nextIndex, 0, block);
  emitHtml();
}

function duplicateSelected() {
  if (!selectedBlock.value) return;
  const copy = duplicateBlock(selectedBlock.value);
  parsed.value.blocks.splice(selectedIndex.value + 1, 0, copy);
  selectedId.value = copy.id;
  emitHtml();
}

function deleteSelected() {
  if (selectedIndex.value < 0) return;
  parsed.value.blocks.splice(selectedIndex.value, 1);
  selectedId.value = parsed.value.blocks[Math.max(selectedIndex.value - 1, 0)]?.id || '';
  emitHtml();
}

function updateStyle(property: string, value: string) {
  if (!selectedBlock.value) return;
  setBlockStyleProperty(selectedBlock.value, property, value);
  emitHtml();
}

function applyHistoryValue(value: string | undefined) {
  if (value === undefined) return;
  parsed.value = parseVisualHtml(value);
  selectedId.value = parsed.value.blocks[0]?.id || selectedId.value;
  syncingFromSelf.value = true;
  emit('update:modelValue', value);
}

function undo() { applyHistoryValue(history.undo()); }
function redo() { applyHistoryValue(history.redo()); }

function onHistoryShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return;
  const target = event.target as HTMLElement | null;
  if (target?.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
  else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
}

onMounted(() => window.addEventListener('keydown', onHistoryShortcut));
onBeforeUnmount(() => window.removeEventListener('keydown', onHistoryShortcut));

function styleValue(block: VisualBlock, property: string) {
  for (const part of (block.style || '').split(';')) {
    const [key, ...rest] = part.split(':');
    if (key?.trim() === property) return rest.join(':').trim();
  }
  return '';
}

function hasTextField(type: VisualBlockType) {
  return ['heading', 'paragraph', 'section', 'card', 'button', 'link'].includes(type);
}

function blockLabel(block: VisualBlock) {
  if (block.type === 'heading') return `H${block.level || 2}: ${block.text || 'Heading'}`;
  if (block.type === 'raw') return 'Raw HTML';
  return `${block.type}: ${block.text || block.body || block.href || block.src || 'Untitled'}`;
}
</script>
