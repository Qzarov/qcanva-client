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
    publicResources: 'Публичные материалы доступны без регистрации.', interactiveTemplate: 'Интерактивный шаблон',
    accessRequests: 'Запросы доступа', approve: 'Одобрить', decline: 'Отклонить', owner: 'Владелец', pinned: 'Закреплено',
    duplicate: 'Дублировать', moveToGroup: 'Переместить в группу', editTags: 'Изменить теги', pin: 'Закрепить', unpin: 'Открепить', transferOwnership: 'Передать владельца',
    groupActions: 'Действия с группой', createGroup: 'Создать группу', moveToGroupTitle: 'Переместить в группу', groupName: 'Название группы', chooseGroup: 'Выберите группу для этого ресурса.',
    cancel: 'Отмена', save: 'Сохранить', close: 'Закрыть', editGroup: 'Переименовать группу', shareGroup: 'Открыть доступ к группе', invitePeople: 'Пригласить людей', email: 'Электронная почта',
    canView: 'Просмотр', canEdit: 'Редактирование', noInvited: 'Пока никого не пригласили.', loadingAccess: 'Загружаем доступ…', addTag: 'Добавить тег', noTags: 'Тегов пока нет.', refs: 'использований',
    publicEdit: 'Публичное редактирование', unknownOwner: 'Неизвестный владелец', untitled: 'Без названия', untitledHtml: 'HTML без названия', untitledDocument: 'Документ без названия',
    description: 'Описание', descriptionEmpty: 'Описание не заполнено.', descriptionPlaceholder: 'Опишите, что это за документ и зачем он нужен',
    addFolder: 'Добавить папку', addFolderTitle: 'Новая папка внутри', folderName: 'Название папки', createFolder: 'Создать папку', folderCreated: 'Папка создана',
    upOneLevel: 'На уровень выше', subfolders: 'Подпапки', emptyFolder: 'Пусто',
    move: 'Переместить', create: 'Создать', inRoot: 'В корне', chooseFolder: 'Выберите папку, куда переместить. Вложенные папки показаны с отступом.',
    renameGroupNote: 'Все ресурсы этой группы останутся в ней под новым названием.',
    add: 'Добавить', addTextNode: 'Текстовый блок', addGroupNode: 'Группа', addImage: 'Изображение', addCanvasEmbed: 'Канвас', addDocumentEmbed: 'Документ',
    collapseSubfolders: 'Свернуть вложенные папки', expandSubfolders: 'Развернуть вложенные папки',
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
    publicResources: 'Public resources available without registration.', interactiveTemplate: 'Interactive template',
    accessRequests: 'Access requests', approve: 'Approve', decline: 'Decline', owner: 'Owner', pinned: 'Pinned',
    duplicate: 'Duplicate', moveToGroup: 'Move to group', editTags: 'Edit tags', pin: 'Pin', unpin: 'Unpin', transferOwnership: 'Transfer ownership',
    groupActions: 'Group actions', createGroup: 'Create group', moveToGroupTitle: 'Move to group', groupName: 'Group name', chooseGroup: 'Choose a group for this resource.',
    cancel: 'Cancel', save: 'Save', close: 'Close', editGroup: 'Rename group', shareGroup: 'Share group', invitePeople: 'Invite people', email: 'Email',
    canView: 'Can view', canEdit: 'Can edit', noInvited: 'No invited people yet.', loadingAccess: 'Loading access…', addTag: 'Add tag', noTags: 'No tags yet.', refs: 'refs',
    publicEdit: 'Public edit', unknownOwner: 'Unknown owner', untitled: 'Untitled', untitledHtml: 'Untitled HTML', untitledDocument: 'Untitled document',
    description: 'Description', descriptionEmpty: 'No description yet.', descriptionPlaceholder: 'Describe what this document is and what it is for',
    addFolder: 'Add folder', addFolderTitle: 'New folder inside', folderName: 'Folder name', createFolder: 'Create folder', folderCreated: 'Folder created',
    upOneLevel: 'Up one level', subfolders: 'Subfolders', emptyFolder: 'Empty',
    move: 'Move', create: 'Create', inRoot: 'At the root', chooseFolder: 'Choose the folder to move into. Nested folders are shown indented.',
    renameGroupNote: 'Every resource in this group stays in it under the new name.',
    add: 'Add', addTextNode: 'Text block', addGroupNode: 'Group', addImage: 'Image', addCanvasEmbed: 'Canvas', addDocumentEmbed: 'Document',
    collapseSubfolders: 'Collapse subfolders', expandSubfolders: 'Expand subfolders',
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
