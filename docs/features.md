> Сверено с `q-space` @ c78a013, 2026-10-27.

# Функциональная карта веб-клиента QCanva (qcanva-client)

В документе систематизированы все пользовательские и системные функции веб-клиента `qcanva-client`, сгруппированные по экранам и функциональным областям. Статус каждой функции строго определён (`в интерфейсе`, `за флагом <VITE_NAME>`, `только Android`, `служебное`), указан точный файл расположения в коде и соответствующий эндпоинт хаба `canvas-server-back`.

---

## 1. Вход и аккаунт

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Аутентификация по email и паролю | в интерфейсе | `src/views/LoginView.vue` | `POST /api/auth/login` |
| Регистрация новой учётной записи | в интерфейсе | `src/views/RegisterView.vue` | `POST /api/auth/register` |
| Выход из учётной записи с очисткой реестра вкладок | в интерфейсе | `src/components/AccountMenu.vue` | `—` |
| Отображение профиля текущего пользователя | в интерфейсе | `src/components/AccountMenu.vue` | `—` |
| Переключение темы оформления (светлая / тёмная / системная) | в интерфейсе | `src/components/ThemeSelector.vue` | `—` |
| Быстрое переключение языка интерфейса (RU / EN) | в интерфейсе | `src/components/LanguageToggle.vue` | `—` |
| Вход по временному паролю к защищённому ресурсу | в интерфейсе | `src/components/AccessGate.vue` | `POST /api/auth/resource-password-login` |
| Отладочное переопределение адреса хаба | за флагом `VITE_ALLOW_HUB_OVERRIDE` | `src/components/HubOverrideField.vue` | `—` |

---

## 2. Дашборд и ресурсы

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Просмотр списка недавних открытых ресурсов (Recents) | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/recent-resources` |
| Получение списка собственных и доступных канвасов | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/canvas` |
| Получение списка HTML-документов пользователя | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/html-documents` |
| Получение списка текстовых документов пользователя | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/text-documents` |
| Получение списка интерактивных шаблонов (доски, листы) | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/interactive-templates` |
| Получение списка публичных ресурсов (без авторизации) | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/canvas`, `GET /api/html-documents/public`, `GET /api/text-documents/public` |
| Создание нового канваса | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/canvas` |
| Создание нового HTML-документа | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/html-documents` |
| Создание нового текстового документа | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/text-documents` |
| Создание интерактивного шаблона (доска / лист D&D 5e) | в интерфейсе | `src/components/dashboard/InteractiveTemplatePicker.vue` | `POST /api/interactive-templates` |
| Создание папки ресурсов | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/resource-folders` |
| Создание вложенной подпапки в дереве | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/resource-folders` |
| Перемещение папки в иерархии (re-parenting) | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/resource-folders/:id/parent` |
| Переименование папки ресурсов | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/resource-folders/:id` |
| Удаление папки ресурсов | в интерфейсе | `src/views/DashboardView.vue` | `DELETE /api/resource-folders/:id` |
| Перемещение ресурса между папками (модальное окно и DnD) | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/resource-folders/:id/resources` |
| Изменение порядка сортировки папок перетаскиванием | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/resource-folders/order` |
| Приглашение пользователя к папке ресурсов | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/resource-folders/:id/share` |
| Отзыв доступа к папке ресурсов | в интерфейсе | `src/views/DashboardView.vue` | `DELETE /api/resource-folders/:id/share` |
| Просмотр прав доступа к папке ресурсов | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/resource-folders/:id/permissions` |
| Закрепление ресурса (pin / unpin) | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id`, `PUT /api/text-documents/:id` |
| Быстрое инлайн-переименование ресурса | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/canvas/:id` |
| Редактирование описания ресурса | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id`, `PUT /api/text-documents/:id` |
| Дублирование ресурса | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/canvas/:id/duplicate`, `POST /api/html-documents/:id/duplicate`, `POST /api/text-documents/:id/duplicate` |
| Передача владения ресурсом другому пользователю | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/canvas/:id/transfer-ownership`, `POST /api/html-documents/:id/transfer-ownership`, `POST /api/text-documents/:id/transfer-ownership` |
| Удаление ресурса | в интерфейсе | `src/views/DashboardView.vue` | `DELETE /api/canvas/:id`, `DELETE /api/html-documents/:id`, `DELETE /api/text-documents/:id`, `DELETE /api/interactive-templates/:id` |
| Привязка цветных тегов к ресурсу | в интерфейсе | `src/views/DashboardView.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id`, `PUT /api/text-documents/:id` |
| Глобальное управление тегами (список, переименование, цвет, удаление) | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/tags`, `PUT /api/tags/:name`, `DELETE /api/tags/:name` |
| Фильтрация по типам ресурсов (канвас, HTML, документы, шаблоны) | в интерфейсе | `src/views/DashboardView.vue` | `—` |
| Фильтрация по выбранным тегам | в интерфейсе | `src/views/DashboardView.vue` | `—` |
| Полнотекстовый поиск по названию, группе и тегам | в интерфейсе | `src/views/DashboardView.vue` | `—` |
| Переключение отображения ресурсов (плитка / список) | в интерфейсе | `src/components/dashboard/DashboardViewToggle.vue` | `—` |
| Импорт файлов `.canvas`, `.json`, `.html`, `.htm` | в интерфейсе | `src/views/DashboardView.vue` | `POST /api/canvas`, `POST /api/html-documents` |
| Жест Pull-to-refresh для обновления кэша дашборда | в интерфейсе | `src/views/DashboardView.vue` | `—` |
| Рассмотрение входящих запросов доступа (одобрение / отказ) | в интерфейсе | `src/views/DashboardView.vue` | `GET /api/access-requests/incoming`, `PUT /api/access-requests/:id` |

---

## 3. Диск «Файлы»

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Просмотр папки диска и навигация по хлебным крошкам | в интерфейсе | `src/views/DriveView.vue` | `GET /api/drive/folders/:id` |
| Список файлов и папок с курсорной пагинацией | в интерфейсе | `src/views/DriveView.vue` | `GET /api/drive/folders/:id/items` |
| Фильтрация элементов по срезам (Все, Медиа, Файлы, Документы) | в интерфейсе | `src/views/DriveView.vue` | `GET /api/drive/folders/:id/items` |
| Сортировка элементов по имени, дате и размеру | в интерфейсе | `src/views/DriveView.vue` | `GET /api/drive/folders/:id/items` |
| Поиск по текущей папке или по всему диску | в интерфейсе | `src/views/DriveView.vue` | `GET /api/drive/search` |
| Загрузка файлов через системный диалог выбора | в интерфейсе | `src/views/DriveView.vue` | `POST /api/drive/folders/:folderId/files` |
| Загрузка файлов перетаскиванием (Drag & Drop) на окно | в интерфейсе | `src/views/DriveView.vue` | `POST /api/drive/folders/:folderId/files` |
| Плавающая панель прогресса загрузок с возможностью отмены | в интерфейсе | `src/views/DriveView.vue` | `—` |
| Создание новой папки диска | в интерфейсе | `src/views/DriveView.vue` | `POST /api/resource-folders` |
| Переименование файла на диске | в интерфейсе | `src/views/DriveView.vue` | `PATCH /api/drive/files/:id` |
| Скачивание файла по временной подписанной ссылке | в интерфейсе | `src/views/DriveView.vue` | `POST /api/drive/files/:id/download-link` |
| Просмотр свойств файла (хеш SHA-256, тип, реплики хранения) | в интерфейсе | `src/components/DriveFileProperties.vue` | `GET /api/drive/files/:id/meta`, `GET /api/drive/devices` |
| Перемещение файла в корзину | в интерфейсе | `src/views/DriveView.vue` | `DELETE /api/drive/files/:id` |
| Просмотр удалённых файлов в корзине | в интерфейсе | `src/views/DriveTrashView.vue` | `GET /api/drive/trash` |
| Восстановление файла из корзины в исходную папку | в интерфейсе | `src/views/DriveTrashView.vue` | `POST /api/drive/files/:id/restore` |
| Окончательное безвозвратное удаление файла | в интерфейсе | `src/views/DriveTrashView.vue` | `DELETE /api/drive/files/:id?permanent=true` |

---

## 4. Фото

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Переключатель режимов «Файлы» / «Фото» в боковом меню | за флагом `VITE_PHOTOS_ENABLED` | `src/views/DriveView.vue` | `—` |
| Помесячная лента фотоархива (месячные бакеты) | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/DrivePhotos.vue` | `GET /api/drive/photos/buckets` |
| Ленивая подгрузка медиа-элементов выбранного месяца | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/DrivePhotos.vue` | `GET /api/drive/photos/bucket` |
| Семантический поиск по фотографиям и распознанному тексту | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/DrivePhotos.vue` | `POST /api/drive/photos/search` |
| Полоса распознанных лиц и фильтрация фотографий по человеку | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/DrivePhotos.vue` | `GET /api/drive/photos/people` |
| Просмотр фото и видео в полноэкранном лайтбоксе | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/PhotoViewer.vue` | `POST /api/drive/files/:id/download-link` |
| Переход из просмотра фото к содержащей папке на Диске | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/PhotoViewer.vue` | `—` |
| Скачивание оригинала медиафайла из просмотрщика | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/PhotoViewer.vue` | `POST /api/drive/files/:id/download-link` |
| Просмотр свойств медиафайла из просмотрщика | за флагом `VITE_PHOTOS_ENABLED` | `src/components/photos/PhotoViewer.vue` | `GET /api/drive/files/:id/meta` |
| Использование локальных сгенерированных демо-данных вместо хаба | за флагом `VITE_PHOTOS_MOCK` | `src/api/photos.mock.ts` | `—` |

---

## 5. Текстовые документы

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Загрузка содержимого и прав доступа документа | в интерфейсе | `src/views/TextDocumentView.vue` | `GET /api/text-documents/:id` |
| Совместное редактирование реального времени (TipTap + Yjs CRDT) | в интерфейсе | `src/views/TextDocumentView.vue` | `WebSocket /text-docs-ws` |
| Отображение удалённых курсоров и выделений соавторов | в интерфейсе | `src/views/TextDocumentView.vue` | `WebSocket /text-docs-ws` |
| Восстановление сессии и подгрузка снепшота при разрыве связи | в интерфейсе | `src/views/TextDocumentView.vue` | `GET /api/text-documents/:id/snapshot`, `POST /api/text-documents/:id/updates` |
| Инлайн-редактирование заголовка страницы Notion-стиля | в интерфейсе | `src/views/TextDocumentView.vue` | `PUT /api/text-documents/:id` |
| Всплывающее меню команд Slash (`/`) | в интерфейсе | `src/views/TextDocumentView.vue` | `—` |
| Всплывающее меню упоминаний документов и заголовков (`@`) | в интерфейсе | `src/text-documents/mention-menu.ts` | `GET /api/text-documents/search` |
| Разрешение заголовков упоминаний без раскрытия тела документов | в интерфейсе | `src/views/TextDocumentView.vue` | `GET /api/text-documents/:id/mentions` |
| Панель обратных ссылок (Backlinks) на текущий документ | в интерфейсе | `src/views/TextDocumentView.vue` | `GET /api/text-documents/:id/backlinks` |
| Плавающее контекстное меню форматирования выделенного текста | в интерфейсе | `src/views/TextDocumentView.vue` | `—` |
| Работа с таблицами (добавление строк/колонок, ручки перемещения) | в интерфейсе | `src/views/TextDocumentView.vue` | `—` |
| Блоки с подсветкой синтаксиса кода (lowlight / highlight.js) | в интерфейсе | `src/views/TextDocumentView.vue` | `—` |
| Сворачиваемые заголовки (Collapsible headings) | в интерфейсе | `src/views/TextDocumentView.vue` | `—` |
| Боковая панель оглавления (Outline) с переходом к секциям | в интерфейсе | `src/views/TextDocumentView.vue` | `—` |
| Контроль лимита блоков и автоматическое разбиение на страницы | в интерфейсе | `src/views/TextDocumentView.vue` | `POST /api/text-documents` |
| Загрузка и вставка изображений в текст документа | в интерфейсе | `src/views/TextDocumentView.vue` | `POST /api/canvas/files` |
| Просмотр истории изменений документа и восстановление ревизий | в интерфейсе | `src/views/TextDocumentView.vue` | `GET /api/text-documents/:id/history`, `GET /api/text-documents/:id/history/:revision`, `POST /api/text-documents/:id/history/:revision/restore` |
| Переключение полноэкранного режима редактирования | в интерфейсе | `src/views/TextDocumentView.vue` | `—` |

---

## 6. HTML-документы

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Загрузка метаданных и HTML-кода документа | в интерфейсе | `src/views/HtmlDocumentView.vue` | `GET /api/html-documents/:id` |
| Интерактивный предпросмотр документа в песочнице `iframe` | в интерфейсе | `src/views/HtmlDocumentView.vue` | `—` |
| Редактор исходного кода страницы | в интерфейсе | `src/views/HtmlDocumentView.vue` | `PUT /api/html-documents/:id` |
| Раздельный режим отображения (Split View) | в интерфейсе | `src/views/HtmlDocumentView.vue` | `—` |
| Сохранение интерактивного состояния чекбоксов внутри iframe | в интерфейсе | `src/views/HtmlDocumentView.vue` | `PUT /api/html-documents/:id/checklist` |
| Экспорт HTML-документа в PDF | в интерфейсе | `src/views/HtmlDocumentView.vue` | `GET /api/html-documents/:id/export/pdf` |
| Локальное скачивание файла `.html` | в интерфейсе | `src/views/HtmlDocumentView.vue` | `—` |
| Просмотр истории версий HTML с превью и откат ревизии | в интерфейсе | `src/views/HtmlDocumentView.vue` | `GET /api/html-documents/:id/history`, `GET /api/html-documents/:id/history/:entryId`, `POST /api/html-documents/:id/history/:entryId/restore` |
| Совместная синхронизация изменений по протоколу WebSocket | в интерфейсе | `src/composables/useHtmlSocket.ts` | `WebSocket /html-ws` |

---

## 7. Канвасы и рисование

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Загрузка графа узлов, связей и состояния канваса | в интерфейсе | `src/views/CanvasView.vue` | `GET /api/canvas/:id` |
| Совместное редактирование канваса по протоколу OT (`canvas-op`) | в интерфейсе | `src/views/CanvasView.vue` | `WebSocket /canvas-ws` |
| Трансляция курсоров и присутствия соавторов в комнате | в интерфейсе | `src/views/CanvasView.vue` | `WebSocket /canvas-ws` |
| Аварийная синхронизация полного снепшота (circuit breaker) | в интерфейсе | `src/views/CanvasView.vue` | `POST /api/canvas/:id/resync`, `PUT /api/canvas/:id` |
| Добавление и форматирование текстовых карточек и заметок | в интерфейсе | `src/components/CanvasLoader.vue` | `WebSocket /canvas-ws` |
| Загрузка и размещение картинок на канвасе | в интерфейсе | `src/components/CanvasLoader.vue` | `POST /api/canvas/files` |
| Встраивание интерактивных текстовых и HTML-документов | в интерфейсе | `src/components/CanvasLoader.vue` | `GET /api/text-documents`, `GET /api/html-documents` |
| Встраивание интерактивных шаблонов (досок, персонажей) | в интерфейсе | `src/components/CanvasLoader.vue` | `GET /api/interactive-templates` |
| Свободное рисование (ручка, маркер, геометрические фигуры, ластик) | в интерфейсе | `src/canvas/CanvasDrawingPanel.vue` | `WebSocket /canvas-ws` |
| Настройка заливки, границ и цветов узлов канваса | в интерфейсе | `src/canvas/CanvasColorMenu.vue` | `—` |
| Совместная линейка измерений расстояний (Ruler tool) | в интерфейсе | `src/composables/useCanvasRuler.ts` | `WebSocket /canvas-ws` |
| Настройка единиц измерения линейки (метры, футы, масштаб) | в интерфейсе | `src/components/CanvasRulerSettings.vue` | `PUT /api/canvas/:id/ruler-settings` |
| Встроенный групповой чат канваса с цитированием узлов | в интерфейсе | `src/components/ChatPanel.vue` | `GET /api/canvas/:id/messages`, `WebSocket /canvas-ws` |
| Бросок игральных костей (Dice roller) с отправкой в чат | в интерфейсе | `src/views/CanvasView.vue` | `WebSocket /canvas-ws` |
| Просмотр истории канваса и откат к ревизии | в интерфейсе | `src/views/CanvasView.vue` | `GET /api/canvas/:id/history`, `GET /api/canvas/:id/history/:revision/snapshot`, `POST /api/canvas/:id/history/:revision/restore` |
| Настройка политики доступа к истории (владелец / редакторы / все) | в интерфейсе | `src/views/CanvasView.vue` | `PUT /api/canvas/:id/history-access` |

---

## 8. Доски (Kanban)

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Загрузка канбан-доски и списков колонок | в интерфейсе | `src/views/BoardTemplateView.vue` | `GET /api/interactive-templates/:id` |
| Совместная синхронизация операций доски через WebSocket | в интерфейсе | `src/composables/useBoardSocket.ts` | `WebSocket /boards-ws` |
| Получение начального снепшота комнаты доски | в интерфейсе | `src/composables/useBoardSocket.ts` | `GET /api/interactive-templates/:id/snapshot` |
| Добавление, переименование, удаление и перемещение колонок | в интерфейсе | `src/components/board/BoardEditor.vue` | `WebSocket /boards-ws` |
| Создание, редактирование и перетаскивание карточек | в интерфейсе | `src/components/board/BoardEditor.vue` | `WebSocket /boards-ws` |
| Привязка текстовых документов к карточкам канбана | в интерфейсе | `src/components/board/BoardEditor.vue` | `GET /api/text-documents/:id` |
| Приглашение соавторов к доске и отзыв прав | в интерфейсе | `src/components/board/BoardShareDialog.vue` | `POST /api/interactive-templates/:id/share`, `DELETE /api/interactive-templates/:id/share`, `GET /api/interactive-templates/:id/share` |

---

## 9. Листы персонажа (D&D 5e)

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Переключение режимов: Setup (настройка параметров) / Play (игра) | в интерфейсе | `src/views/InteractiveTemplateView.vue` | `—` |
| Совместная синхронизация листа (строгий replay операций) | в интерфейсе | `src/composables/useCharacterSheetSocket.ts` | `WebSocket /character-sheets-ws` |
| Локальный Undo / Redo в режиме Setup | в интерфейсе | `src/views/InteractiveTemplateView.vue` | `—` |
| Быстрый дайсроллер с произвольными формулами костей | в интерфейсе | `src/components/DndQuickRoll.vue` | `WebSocket /character-sheets-ws` |
| Привязка листа к канвасу (трансляция бросков костей в чат) | в интерфейсе | `src/components/DndCanvasLink.vue` | `WebSocket /character-sheets-ws` |
| Просмотр истории правок листа персонажа | в интерфейсе | `src/components/DndSheetHistory.vue` | `GET /api/interactive-templates/:id/history` |
| Откат состояния листа к исторической записи настройки | в интерфейсе | `src/components/DndSheetHistory.vue` | `POST /api/interactive-templates/:id/history/restore` |
| Загрузка аватара/портрета персонажа | в интерфейсе | `src/views/InteractiveTemplateView.vue` | `POST /api/canvas/files` |
| Импорт персонажа из формата LongStoryShort JSON | в интерфейсе | `src/components/dashboard/InteractiveTemplatePicker.vue` | `POST /api/interactive-templates` |

---

## 10. Совместная работа и чат

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Отображение присутствия активных пользователей (аватары, цвета) | в интерфейсе | `src/views/CanvasView.vue`, `src/views/TextDocumentView.vue` | `WebSocket /canvas-ws`, `WebSocket /text-docs-ws` |
| Передача и визуализация курсоров соавторов | в интерфейсе | `src/views/CanvasView.vue`, `src/views/TextDocumentView.vue` | `WebSocket /canvas-ws`, `WebSocket /text-docs-ws` |
| Чат канваса реального времени с цитированием сообщений | в интерфейсе | `src/components/ChatPanel.vue` | `WebSocket /canvas-ws`, `GET /api/canvas/:id/messages` |
| Прикрепление узлов канваса к сообщениям чата | в интерфейсе | `src/components/ChatPanel.vue` | `WebSocket /canvas-ws` |
| Измерение расстояний совместной линейкой на канвасе | в интерфейсе | `src/composables/useCanvasRuler.ts` | `WebSocket /canvas-ws` |

---

## 11. Шаринг и доступ

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Унифицированная панель общего доступа (ResourceSharePanel) | в интерфейсе | `src/components/ResourceSharePanel.vue` | `—` |
| Копирование канонической публичной ссылки ресурса | в интерфейсе | `src/components/ResourceSharePanel.vue` | `—` |
| Переключение уровня видимости (Private / Authenticated / Public) | в интерфейсе | `src/components/ResourceSharePanel.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id`, `PUT /api/text-documents/:id` |
| Разрешение публичного редактирования без авторизации | в интерфейсе | `src/components/ResourceSharePanel.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id` |
| Включение в общий публичный каталог ресурсов | в интерфейсе | `src/components/ResourceSharePanel.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id` |
| Назначение пользовательского короткого адреса (Slug) | в интерфейсе | `src/components/ResourceSharePanel.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id` |
| Защита ресурса персональным паролем (роли Viewer / Editor) | в интерфейсе | `src/components/ResourceSharePanel.vue` | `PUT /api/canvas/:id`, `PUT /api/html-documents/:id` |
| Приглашение соавторов по email с выбором роли | в интерфейсе | `src/components/ResourceSharePanel.vue` | `POST /api/canvas/:id/share`, `POST /api/html-documents/:id/share`, `POST /api/text-documents/:id/share` |
| Отзыв индивидуального доступа пользователя к ресурсу | в интерфейсе | `src/components/ResourceSharePanel.vue` | `DELETE /api/canvas/:id/share`, `DELETE /api/html-documents/:id/share`, `DELETE /api/text-documents/:id/share` |
| Экран блокировки при 401/403 (AccessGate) | в интерфейсе | `src/components/AccessGate.vue` | `POST /api/auth/resource-password-login` |
| Отправка запроса владельцу на получение прав просмотра или правки | в интерфейсе | `src/components/AccessRequestDialog.vue` | `POST /api/access-requests` |

---

## 12. Устройства / Q Control (ЦУП)

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Сводка безопасности файлов («В безопасности ли мои файлы?») | в интерфейсе | `src/views/DriveDevicesView.vue` | `GET /api/drive/safety` |
| Проверка сохранности файлов на сервере по корневым папкам | в интерфейсе | `src/views/DriveDevicesView.vue` | `GET /api/drive/safety/folders` |
| Мониторинг подключённых устройств хранения и статуса синхронизации | в интерфейсе | `src/views/DriveDevicesView.vue` | `GET /api/drive/devices` |
| Просмотр детальных правил хранения и числа файлов на устройстве | в интерфейсе | `src/components/DriveDeviceFolderDialog.vue` | `GET /api/drive/folders/:id` |
| Отзыв / отключение устройства от хранилища Q Space | в интерфейсе | `src/components/DriveDeviceRemoveDialog.vue` | `DELETE /api/drive/devices/:id` |
| Просмотр списка утерянных файлов (Lost files без онлайн-копий) | в интерфейсе | `src/views/DriveDevicesView.vue` | `GET /api/drive/safety/lost` |
| Массовое перемещение утерянных файлов в корзину | в интерфейсе | `src/views/DriveDevicesView.vue` | `POST /api/drive/safety/lost/trash` |

---

## 13. Настройки

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Просмотр данных аккаунта и аватара пользователя | в интерфейсе | `src/views/SettingsView.vue` | `—` |
| Выбор цветовой схемы интерфейса | в интерфейсе | `src/views/SettingsView.vue` | `—` |
| Выбор языка пользовательского интерфейса | в интерфейсе | `src/views/SettingsView.vue` | `—` |
| Настройка параметров генерации HTML (модель OpenRouter и API-ключ) | в интерфейсе | `src/views/SettingsView.vue` | `GET /api/html-documents/settings/current`, `PUT /api/html-documents/settings/current` |
| Отладочное переопределение адреса хаба | за флагом `VITE_ALLOW_HUB_OVERRIDE` | `src/components/HubOverrideField.vue` | `—` |

---

## 14. Android-специфика

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Реестр открытых вкладок ресурсов (App Tabs) | только Android | `src/tabs/registry.ts` | `—` |
| Кнопка со счётчиком вкладок и панель переключения | только Android | `src/components/tabs/TabsButton.vue` | `—` |
| Спящий режим вкладок (KeepAlive) и сохранение скролла | только Android | `src/tabs/scrollMemory.ts` | `—` |
| Перехват аппаратной кнопки Назад (стек useBackHandler) | только Android | `src/composables/useBackHandler.ts` | `—` |
| Мониторинг локальной ноды хранения телефона (Rust core FFI) | только Android | `src/composables/usePhoneNode.ts` | `—` |
| Действие «Скачать на телефон» (phone fetch) для файла на Диске | только Android | `src/views/DriveView.vue` | `—` |
| Действие «Освободить место на телефоне» (phone evict) | только Android | `src/views/DriveView.vue` | `—` |
| Запрос системных разрешений Android (All files, батарея) | только Android | `src/native/qspaceAgent.ts` | `—` |

---

## 15. Панель администратора (Admin)

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Сводная статистика системы (пользователи и канвасы) | в интерфейсе | `src/views/AdminView.vue` | `GET /api/admin/stats` |
| Список пользователей и назначение ролей (User / Admin / Superadmin) | в интерфейсе | `src/views/AdminView.vue` | `GET /api/admin/users`, `PUT /api/admin/users/:userId/role` |
| Список всех канвасов и управление политикой доступа к истории | в интерфейсе | `src/views/AdminView.vue` | `GET /api/admin/canvases`, `PUT /api/admin/canvases/:canvasId/history-access` |
| Настройка максимального размера загружаемого файла | в интерфейсе | `src/views/AdminView.vue` | `GET /api/admin/settings`, `PUT /api/admin/settings` |
| Настройка лимита емкости диска сервера | в интерфейсе | `src/views/AdminView.vue` | `GET /api/admin/settings`, `PUT /api/admin/settings` |

---

## 16. MCP-токены (Model Context Protocol)

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Отображение персонального HTTP-эндпоинта MCP сервера | в интерфейсе | `src/components/settings/McpTokensPanel.vue` | `—` |
| Просмотр списка выпущенных персональных токенов MCP | в интерфейсе | `src/components/settings/McpTokensPanel.vue` | `GET /api/mcp-tokens` |
| Выпуск токена с выбором разрешённых действий и скоупа папок | в интерфейсе | `src/components/settings/McpTokensPanel.vue` | `POST /api/mcp-tokens` |
| Генерация конфигурации подключения MCP клиента (json) | в интерфейсе | `src/components/settings/McpTokensPanel.vue` | `—` |
| Переименование MCP-токена | в интерфейсе | `src/components/settings/McpTokensPanel.vue` | `PATCH /api/mcp-tokens/:id` |
| Отзыв MCP-токена | в интерфейсе | `src/components/settings/McpTokensPanel.vue` | `DELETE /api/mcp-tokens/:id` |

---

## 17. Служебное

| Функция | Статус | Где в коде | Эндпоинт хаба |
|---|---|---|---|
| Очередь глобальных диалогов приложения (confirm / alert / prompt) | служебное | `src/components/AppDialogHost.vue` | `—` |
| Контейнер отображения всплывающих тостов (toasts) | служебное | `src/components/ToastContainer.vue` | `—` |
| Обновление токенов картинок канваса | служебное | `src/composables/useCanvasImageTokens.ts` | `POST /api/canvas/:id/image-token` |
| Обновление токенов картинок ресурсов (HTML, шаблоны, документы) | служебное | `src/composables/useResourceImageTokens.ts` | `POST /api/html-documents/:id/image-token`, `POST /api/interactive-templates/:id/image-token`, `POST /api/text-documents/:id/image-token` |
| Фиксация открытия ресурса для истории недавних | служебное | `src/composables/useRecentResource.ts` | `POST /api/recent-resources` |
| Локальное кэширование ресурсов для быстрого открытия на Android | служебное | `src/composables/useNativeResourceCache.ts` | `—` |

---

## Есть в API-слое, нет в интерфейсе

В таблице перечислены экспортированные API-функции хаба, которые объявлены в клиентском API-слое `src/api/*`, но **не вызываются ни одним компонентом, представлением или composable**. Проверено поиском по всей кодовой базе:

| Функция src/api | Эндпоинт | Файл |
|---|---|---|
| `auth.refreshToken` | `POST /api/auth/refresh-token` | `src/api/client.ts` |
| `auth.me` | `GET /api/auth/me` | `src/api/client.ts` |
| `htmlDocuments.createGroup` | `POST /api/resource-folders` | `src/api/client.ts` |
| `htmlDocuments.renameGroup` | `PUT /api/resource-folders/:id` | `src/api/client.ts` |
| `htmlDocuments.move` | `PUT /api/resource-folders/:folderId/resources` | `src/api/client.ts` |
| `textDocuments.moveToFolder` | `PUT /api/resource-folders/:folderId/resources` | `src/api/client.ts` |
| `driveApi.moveFile` | `PATCH /api/drive/files/:id` | `src/api/drive.ts` |
| `driveApi.updateFile` | `PATCH /api/drive/files/:id` | `src/api/drive.ts` |
| `driveApi.updateDevice` | `PATCH /api/drive/devices/:id` | `src/api/drive.ts` |
| `driveApi.getDevicePolicy` | `GET /api/drive/devices/:id/policy` | `src/api/drive.ts` |
| `driveApi.setDevicePolicy` | `PUT /api/drive/devices/:id/policy` | `src/api/drive.ts` |
| `driveApi.getUnderReplicated` | `GET /api/drive/replication/under` | `src/api/drive.ts` |
| `htmlDocuments.generate` | `POST /api/html-documents/generate` | `src/api/client.ts` (вызывает только `src/views/HtmlDocsView.vue`, которого нет в роутере) |
| `driveApi.createPairingCode` | `POST /api/drive/devices/pairing-codes` | `src/api/drive.ts` (вызывает только неподключённый `src/components/DrivePairDeviceDialog.vue`) |
| `driveApi.cancelPairingCode` | `DELETE /api/drive/devices/pairing-codes/:id` | `src/api/drive.ts` (то же) |
