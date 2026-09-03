import { computed, ref } from 'vue';

export type UiLocale = 'ru' | 'en';
const STORAGE_KEY = 'qcanva:locale';
const getStorage = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};
const initialLocale = (): UiLocale => {
  let stored: string | null = null;
  try {
    stored = getStorage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Storage is optional in private and embedded browsing contexts.
  }
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
    recents: 'Недавние', groups: 'Группы', home: 'Главная', folders: 'Папки', sharedWithMe: 'Доступные мне', public: 'Публичные',
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
    collapseSidebar: 'Свернуть боковую панель', expandSidebar: 'Развернуть боковую панель', openNavigation: 'Открыть навигацию', closeNavigation: 'Закрыть навигацию',
    theme: 'Тема', themeSystem: 'Системная', themeLight: 'Светлая', themeDark: 'Тёмная',
    chat: 'Чат', history: 'История', access: 'Доступ', keyboardShortcuts: 'Горячие клавиши', shortcuts: 'Быстрые клавиши',
    addTextBlock: 'Добавить текстовый блок', addImageBtn: 'Добавить изображение', resetView: 'Сбросить вид', exportCanvas: 'Экспорт .canvas',
    canvasPlugins: 'Плагины канваса', noPluginsForCanvas: 'Для этого канваса пока нет доступных плагинов.',
    pluginEnabled: 'включён', pluginDisabled: 'выключен', disablePlugin: 'Выключить плагин', enablePlugin: 'Включить плагин', pluginOn: 'Вкл', pluginOff: 'Выкл',
    addCharacterCard: 'Добавить карточку персонажа', importFromTemplates: 'Импортировать из шаблонов', loadingTemplates: 'Загружаем шаблоны…', noTemplatesInDashboard: 'В дашборде пока нет шаблонов.',
    background: 'Фон', text: 'Текст', border: 'Рамка', layers: 'Слои', nodeActions: 'Действия',
    solid: 'Сплошная', gradient: 'Градиент', transparent: 'Прозрачная', withBackground: 'С фоном', round: 'Круглая', rectangular: 'Прямоугольная',
    color: 'Цвет', firstLine: 'Первая строка', firstLineShort: '1-я строка', bodyText: 'Основной текст', style: 'Стиль', width: 'Толщина',
    layerUp: 'Слой выше', layerDown: 'Слой ниже', bringToFront: 'На передний план', sendToBack: 'На задний план',
    selectedObjects: 'Выбрано объектов', imageName: 'Название изображения', undo: 'Назад', redo: 'Вперед',
    unlockPosition: 'Разблокировать позицию', lockPosition: 'Заблокировать позицию', show: 'Показать', hide: 'Скрыть',
    alignment: 'Выравнивание', backgroundColor: 'Цвет фона', borderColor: 'Цвет рамки', textColor: 'Цвет текста',
    drawingTools: 'Инструменты рисования', toolSelect: 'Выбор', toolPen: 'Перо', toolHighlighter: 'Маркер', toolRect: 'Прямоугольник',
    toolEllipse: 'Эллипс', toolLine: 'Линия', toolArrow: 'Стрелка', toolEraser: 'Ластик',
    dice: 'Кубики', diceCount: 'Кол-во', diceModifier: 'Мод.', rollDice: 'Бросить',
    insertDocument: 'Вставить документ', textDocsFilter: 'Текстовые', searchDocuments: 'Поиск документов...',
    newTextDocHint: 'Создать новый текстовый документ и добавить его на канвас', creating: 'Создаём...', newDocumentBtn: '+ Новый документ', documentsNotFound: 'Документы не найдены',
    tapNodeToAttach: 'Коснитесь ноды, чтобы прикрепить её к сообщению', addPhoto: 'Добавить фотографию', photo: 'Фото',
    failedLoadTemplates: 'Не удалось загрузить шаблоны', boardAddedToCanvas: 'Доска добавлена на канвас', cardAddedToCanvas: 'Карточка добавлена на канвас',
    failedUpdatePlugin: 'Не удалось обновить плагин', failedRefreshCached: 'Не удалось обновить. Показана сохранённая версия.',
    documentUpdated: 'Документ обновлён', refreshingSaved: 'Обновляем сохранённую версию…',
    failedLoadDocuments: 'Не удалось загрузить документы', failedCreateDocument: 'Не удалось создать документ',
    failedUploadImage: 'Не удалось загрузить изображение', noImageUrlFromServer: 'Сервер не вернул ссылку на изображение',
  },
  en: {
    language: 'Language', english: 'English', russian: 'Русский',
    login: 'Login', register: 'Register', signOut: 'Sign out', settings: 'Settings', plugins: 'Plugins',
    new: 'New', import: 'Import', manageTags: 'Manage tags', admin: 'Admin',
    newCanvas: 'New canvas', htmlDocument: 'HTML document', document: 'Document', group: 'Group',
    search: 'Search by title, group or tag', newest: 'Newest first', oldest: 'Oldest first',
    titleAsc: 'Title A–Z', titleDesc: 'Title Z–A', all: 'All', canvas: 'Canvas', docs: 'Docs',
    recents: 'Recent', groups: 'Groups', home: 'Home', folders: 'Folders', sharedWithMe: 'Shared with me', public: 'Public',
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
    collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar', openNavigation: 'Open navigation', closeNavigation: 'Close navigation',
    theme: 'Theme', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark',
    chat: 'Chat', history: 'History', access: 'Access', keyboardShortcuts: 'Keyboard Shortcuts', shortcuts: 'Shortcuts',
    addTextBlock: 'Add text block', addImageBtn: 'Add image', resetView: 'Reset view', exportCanvas: 'Export .canvas',
    canvasPlugins: 'Canvas plugins', noPluginsForCanvas: 'No plugins available for this canvas yet.',
    pluginEnabled: 'enabled', pluginDisabled: 'disabled', disablePlugin: 'Disable plugin', enablePlugin: 'Enable plugin', pluginOn: 'On', pluginOff: 'Off',
    addCharacterCard: 'Add character card', importFromTemplates: 'Import from templates', loadingTemplates: 'Loading templates…', noTemplatesInDashboard: 'No templates in the dashboard yet.',
    background: 'Background', text: 'Text', border: 'Border', layers: 'Layers', nodeActions: 'Actions',
    solid: 'Solid', gradient: 'Gradient', transparent: 'Transparent', withBackground: 'With background', round: 'Round', rectangular: 'Rectangular',
    color: 'Color', firstLine: 'First line', firstLineShort: 'Line 1', bodyText: 'Body text', style: 'Style', width: 'Width',
    layerUp: 'Bring forward', layerDown: 'Send backward', bringToFront: 'Bring to front', sendToBack: 'Send to back',
    selectedObjects: 'Selected objects', imageName: 'Image name', undo: 'Back', redo: 'Forward',
    unlockPosition: 'Unlock position', lockPosition: 'Lock position', show: 'Show', hide: 'Hide',
    alignment: 'Alignment', backgroundColor: 'Background color', borderColor: 'Border color', textColor: 'Text color',
    drawingTools: 'Drawing tools', toolSelect: 'Select', toolPen: 'Pen', toolHighlighter: 'Highlighter', toolRect: 'Rectangle',
    toolEllipse: 'Ellipse', toolLine: 'Line', toolArrow: 'Arrow', toolEraser: 'Eraser',
    dice: 'Dice', diceCount: 'Count', diceModifier: 'Mod.', rollDice: 'Roll',
    insertDocument: 'Insert document', textDocsFilter: 'Text', searchDocuments: 'Search documents...',
    newTextDocHint: 'Create a new text document and add it to the canvas', creating: 'Creating...', newDocumentBtn: '+ New document', documentsNotFound: 'No documents found',
    tapNodeToAttach: 'Tap a node to attach it to the message', addPhoto: 'Add photo', photo: 'Photo',
    failedLoadTemplates: 'Failed to load templates', boardAddedToCanvas: 'Board added to canvas', cardAddedToCanvas: 'Card added to canvas',
    failedUpdatePlugin: 'Failed to update plugin', failedRefreshCached: 'Failed to refresh. Showing the saved version.',
    documentUpdated: 'Document updated', refreshingSaved: 'Refreshing the saved version…',
    failedLoadDocuments: 'Failed to load documents', failedCreateDocument: 'Failed to create document',
    failedUploadImage: 'Failed to upload image', noImageUrlFromServer: 'Server did not return an image link',
  },
} as const;

export function useI18n() {
  const setLocale = (value: UiLocale) => {
    locale.value = value;
    try {
      getStorage()?.setItem(STORAGE_KEY, value);
    } catch {
      // Keep the in-memory and document locale even when persistence is denied.
    }
    document.documentElement.lang = value;
  };
  const toggleLocale = () => setLocale(locale.value === 'ru' ? 'en' : 'ru');
  const t = (key: keyof typeof messages.en) => messages[locale.value][key];
  return { locale: computed(() => locale.value), setLocale, toggleLocale, t };
}

export const applyInitialLocale = () => { document.documentElement.lang = locale.value; };
