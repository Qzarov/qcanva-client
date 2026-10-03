<template>
  <section class="canvas-ruler-settings">
    <strong>{{ t("rulerSettings") }}</strong>
    <form v-if="isOwner" @submit.prevent="save">
      <label
        >{{ t("rulerUnits")
        }}<select :value="unit" :disabled="busy" @change="changeUnit">
          <option value="m">{{ t("rulerMeters") }}</option>
          <option value="ft">{{ t("rulerFeet") }}</option>
        </select></label
      >
      <label
        >{{ t("rulerScale")
        }}<span class="ruler-scale-input"
          ><input
            v-model="scale"
            data-testid="ruler-scale"
            type="number"
            inputmode="decimal"
            min="0.000000001"
            step="any"
            :disabled="busy"
          />
          = 1 {{ unit }}</span
        ></label
      >
      <p>{{ t("rulerScaleHelp") }}</p>
      <p v-if="!valid" class="ruler-settings-error" role="status">
        {{ t("rulerInvalidScale") }}
      </p>
      <button
        class="btn-primary btn-sm"
        type="submit"
        :disabled="busy || !valid"
      >
        {{ busy ? t("savingEllipsis") : t("save") }}
      </button>
    </form>
    <p v-else>
      {{
        canvasUnitsPerSelectedUnit(settings).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })
      }}
      {{ t("rulerCanvasUnits") }} = 1 {{ settings.unit }}
    </p>
  </section>
</template>
<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  canvasUnitsPerSelectedUnit,
  settingsFromScale,
  type RulerSettings,
  type RulerUnit,
} from "../canvas/ruler";
import { useI18n } from "../composables/useI18n";
const { t } = useI18n();
const props = defineProps<{
  settings: RulerSettings;
  isOwner: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ save: [value: Omit<RulerSettings, "enabled">] }>();
const unit = ref<RulerUnit>(props.settings.unit),
  scale = ref(String(canvasUnitsPerSelectedUnit(props.settings)));
const normalized = computed(() => {
  try {
    return settingsFromScale(unit.value, Number(scale.value));
  } catch {
    return null;
  }
});
const valid = computed(() => normalized.value !== null);
watch(
  () => props.settings,
  (value) => {
    unit.value = value.unit;
    scale.value = String(canvasUnitsPerSelectedUnit(value));
  },
);
function changeUnit(event: Event) {
  const next = (event.target as HTMLSelectElement).value as RulerUnit;
  const prior = normalized.value;
  unit.value = next;
  if (prior)
    scale.value = String(
      canvasUnitsPerSelectedUnit({
        ...prior,
        enabled: props.settings.enabled,
        unit: next,
      }),
    );
}
function save() {
  if (props.isOwner && !props.busy && normalized.value)
    emit("save", normalized.value);
}
</script>
<style scoped>
.canvas-ruler-settings {
  padding: 12px 0;
  border-top: 1px solid var(--ui-border);
  color: var(--ui-text);
}
form {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
label {
  display: grid;
  gap: 5px;
  font-size: 13px;
}
input,
select {
  width: 100%;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  color: var(--ui-text);
  background: var(--ui-surface);
}
.ruler-scale-input {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
p {
  margin: 2px 0;
  font-size: 12px;
  color: var(--ui-text-secondary);
}
.ruler-settings-error {
  color: var(--ui-danger);
}
button {
  justify-self: start;
}
</style>
