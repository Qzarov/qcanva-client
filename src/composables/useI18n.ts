import { computed, ref } from 'vue';

export type UiLocale = 'ru' | 'en';
const STORAGE_KEY = 'qcanva:locale';
const initialLocale = (): UiLocale => {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  if (stored === 'ru' || stored === 'en') return stored;
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
};

const locale = ref<UiLocale>(initialLocale());
const messages = {
  ru: {
    language: 'Язык', english: 'English', russian: 'Русский',
    login: 'Войти', register: 'Регистрация', signOut: 'Выйти', settings: 'Настройки', plugins: 'Плагины',
    new: 'Создать', import: 'Импорт', manageTags: 'Управление тегами', admin: 'Администрирование',
    newCanvas: 'Новый канвас', htmlDocument: 'HTML-документ', document: 'Документ', group: 'Группа',
    search: 'Поиск по названию, группе или тегу', newest: 'Сначала новые', oldest: 'Сначала старые',
    titleAsc: 'Название А–Я', titleDesc: 'Название Я–А', all: 'Все', canvas: 'Канвас', docs: 'Документы',
    recents: 'Недавние', groups: 'Группы', sharedWithMe: 'Доступные мне', public: 'Публичные',
    refresh: 'Обновить', share: 'Доступ', rename: 'Переименовать', delete: 'Удалить',
    loading: 'Загрузка…', updatingList: 'Обновляем список…', dashboard: 'Дашборд',
  },
  en: {
    language: 'Language', english: 'English', russian: 'Русский',
    login: 'Login', register: 'Register', signOut: 'Sign out', settings: 'Settings', plugins: 'Plugins',
    new: 'New', import: 'Import', manageTags: 'Manage tags', admin: 'Admin',
    newCanvas: 'New canvas', htmlDocument: 'HTML document', document: 'Document', group: 'Group',
    search: 'Search by title, group or tag', newest: 'Newest first', oldest: 'Oldest first',
    titleAsc: 'Title A–Z', titleDesc: 'Title Z–A', all: 'All', canvas: 'Canvas', docs: 'Docs',
    recents: 'Recent', groups: 'Groups', sharedWithMe: 'Shared with me', public: 'Public',
    refresh: 'Refresh', share: 'Share', rename: 'Rename', delete: 'Delete',
    loading: 'Loading…', updatingList: 'Updating list…', dashboard: 'Dashboard',
  },
} as const;

export function useI18n() {
  const setLocale = (value: UiLocale) => {
    locale.value = value;
    localStorage.setItem(STORAGE_KEY, value);
    document.documentElement.lang = value;
  };
  const toggleLocale = () => setLocale(locale.value === 'ru' ? 'en' : 'ru');
  const t = (key: keyof typeof messages.en) => messages[locale.value][key];
  return { locale: computed(() => locale.value), setLocale, toggleLocale, t };
}

export const applyInitialLocale = () => { document.documentElement.lang = locale.value; };
