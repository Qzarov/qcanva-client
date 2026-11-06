<template>
  <!-- An email field that offers the user's contacts: the list opens when the field gets the
       cursor and narrows as one types. Any other address can still be typed in. -->
  <div class="contact-email-field">
    <input
      ref="inputEl"
      v-bind="$attrs"
      :value="modelValue"
      type="email"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="showList"
      :aria-controls="listId"
      :aria-activedescendant="showList && active >= 0 ? `${listId}-${active}` : undefined"
      data-contact-email-input
      @focus="openList"
      @click="openList"
      @input="onInput"
      @keydown="onKeydown"
      @blur="open = false"
    />
    <Teleport to="body">
      <ul
        v-if="showList"
        :id="listId"
        class="contact-email-list"
        role="listbox"
        :style="listStyle"
        data-contact-email-list
      >
        <li
          v-for="(contact, index) in matches"
          :id="`${listId}-${index}`"
          :key="contact.id"
          role="option"
          class="contact-email-option"
          :class="{ active: index === active }"
          :aria-selected="index === active"
          :data-contact-email-option="contact.email"
          @mousedown.prevent="choose(contact)"
          @mouseenter="active = index"
        >
          <span class="contact-email-avatar" aria-hidden="true">{{ initial(contact) }}</span>
          <span class="contact-email-who">
            <span class="contact-email-label">{{ label(contact) }}</span>
            <span v-if="label(contact) !== contact.email" class="contact-email-address">{{ contact.email }}</span>
          </span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { ContactView } from '../api/client';
import { filterContacts, useContacts } from '../composables/useContacts';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ modelValue: string; exclude?: string[] }>(), { exclude: () => [] });
const emit = defineEmits<{ 'update:modelValue': [value: string]; pick: [email: string] }>();

const { contacts, ensureLoaded } = useContacts();
const inputEl = ref<HTMLInputElement | null>(null);
const open = ref(false);
const active = ref(-1);
const rect = ref<DOMRect | null>(null);
const listId = `contact-email-list-${Math.random().toString(36).slice(2, 9)}`;

const matches = computed(() => filterContacts(contacts.value, props.modelValue ?? '', props.exclude));
// Nothing to offer, or the field already holds exactly the one match: no list.
const showList = computed(
  () =>
    open.value &&
    matches.value.length > 0 &&
    !(matches.value.length === 1 && matches.value[0]!.email === (props.modelValue ?? '').trim().toLowerCase()),
);

/** The list lives in <body>, so dialogs that clip their content do not cut it; it follows the field. */
const listStyle = computed(() => {
  const box = rect.value;
  if (!box) return {};
  const below = window.innerHeight - box.bottom;
  const upward = below < 220 && box.top > below;
  return {
    left: `${box.left}px`,
    width: `${Math.max(box.width, 220)}px`,
    ...(upward ? { bottom: `${window.innerHeight - box.top + 4}px` } : { top: `${box.bottom + 4}px` }),
  };
});

const label = (contact: ContactView) => contact.name || contact.userName || contact.email;
const initial = (contact: ContactView) => label(contact).trim().charAt(0).toUpperCase() || '?';

function measure() {
  if (inputEl.value) rect.value = inputEl.value.getBoundingClientRect();
}

function openList() {
  measure();
  open.value = true;
  void ensureLoaded();
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
  active.value = -1;
  openList();
}

function choose(contact: ContactView) {
  emit('update:modelValue', contact.email);
  emit('pick', contact.email);
  open.value = false;
  active.value = -1;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!showList.value) {
      openList();
      return;
    }
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const count = matches.value.length;
    active.value = (active.value + step + count) % count;
  } else if (event.key === 'Enter' && showList.value && active.value >= 0) {
    // Picks the highlighted contact instead of submitting the form.
    event.preventDefault();
    event.stopPropagation();
    choose(matches.value[active.value]!);
  } else if (event.key === 'Escape' && showList.value) {
    // Closes the list only; a second Esc reaches the dialog as before.
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
  }
}

watch(matches, () => {
  if (active.value >= matches.value.length) active.value = -1;
});

watch(open, (value) => {
  if (value) {
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
  } else {
    window.removeEventListener('scroll', measure, true);
    window.removeEventListener('resize', measure);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', measure, true);
  window.removeEventListener('resize', measure);
});

defineExpose({ focus: () => inputEl.value?.focus() });
</script>

<style>
/* Takes the input's place in its row: flex and grid layouts size the wrapper, the input fills it. */
.contact-email-field {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
}
.contact-email-field > input {
  flex: 1;
  width: 100%;
  min-width: 0;
}
.contact-email-list {
  position: fixed;
  z-index: 10000;
  max-height: 264px;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface-solid);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.contact-email-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.contact-email-option.active { background: var(--ui-surface-subtle, var(--ui-border)); }
.contact-email-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ui-surface-muted, var(--ui-border));
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 600;
}
.contact-email-who { display: grid; min-width: 0; }
.contact-email-label,
.contact-email-address { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.contact-email-label { color: var(--ui-text); font-size: 13px; }
.contact-email-address { color: var(--ui-text-secondary); font-size: 11px; }
</style>
