<template>
  <div class="markdown-container" v-html="renderedMarkdown"></div>
</template>

<script lang="ts">
import { defineComponent, computed } from "vue";
import { renderMarkdownDocument } from "../documents/markdown-viewer";

export default defineComponent({
  name: "MarkdownRenderer",
  props: {
    markdown: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const renderedMarkdown = computed(() => {
      return renderMarkdownDocument(props.markdown).html;
    });

    return {
      renderedMarkdown,
    };
  },
});
</script>

<style scoped>
.markdown-container {
  padding: 10px;
  background: var(--ui-surface-subtle);
  border-radius: 8px;
  color: var(--ui-text);
  font-family: inherit;
}
</style>
