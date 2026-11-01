/**
 * Each kind of interactive template is known on the dashboard by its own
 * emoji, in place of the generic template icon and the plate naming the
 * kind.
 */
const TEMPLATE_EMOJI: Record<string, string> = {
  'dnd-character': '🐉',
  'trello-board': '📋',
};

export const templateEmoji = (templateType: string | null | undefined): string => (
  (templateType && TEMPLATE_EMOJI[templateType]) || '🧩'
);
