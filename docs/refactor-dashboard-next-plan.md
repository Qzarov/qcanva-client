# Следующий рефакторинг Dashboard

План для разработчика-джуна. Цель блока — завершить декомпозицию Dashboard без изменения пользовательского поведения, API и серверных контрактов.

## Объём

Основные файлы:

- `src/views/DashboardView.vue` — 5586 строк;
- `src/components/dashboard/` — текущие компоненты и незавершённые заготовки;
- `src/views/DashboardView.test.ts` — 3020 строк;
- `tests/dashboard-*.spec.ts` — браузерные сценарии Dashboard.

В карточках canvas, HTML-документов и text-документов повторяются заголовок, теги, дата, selection, pin и меню действий. В текущем import graph 15 компонентов из `src/components/dashboard/` не используются. Их суммарный размер — около 1496 строк.

## Что должно получиться

- общий компонент карточки ресурса;
- общий компонент меню действий ресурса;
- API-вызовы и бизнес-операции остаются в `DashboardView.vue` или composable’ах;
- все `data-*` атрибуты, маршруты, aria-метки и мобильное поведение сохраняются;
- неиспользуемые заготовки удалены либо подключены после проверки их props и событий;
- текущие unit, browser и visual тесты проходят без функциональных изменений.

## Шаг 0. Зафиксировать baseline

Создать ветку:

```bash
git switch -c refactor/dashboard-resource-cards
```

Проверить рабочее дерево:

```bash
git status --short
```

Запустить до любых изменений:

```bash
npm run test:unit
npm run build
npx playwright test \
  tests/admin-plans.spec.ts \
  tests/dashboard-admin-public.spec.ts \
  tests/dashboard-upload.spec.ts \
  tests/dashboard-spaces.spec.ts \
  tests/sidebar.smoke.spec.ts
```

Зафиксировать в описании задачи количество успешно пройденных тестов. Не добавлять в коммит `.claude/`, `dist/`, `test-results/` и другие локальные артефакты.

## Шаг 1. Изучить типы и границы ответственности

В `DashboardView.vue` найти и выписать:

- `FolderItem`;
- `CanvasRecord`;
- `HtmlDocumentRecord`;
- `TextDocumentRecord`;
- `InteractiveTemplateRecord`;
- `isOwnedResource`;
- `selectionKey` и `isSelected`;
- `formatDate` и `formatCardDateMobile`;
- функции открытия ресурса;
- функции действий меню.

Карточка должна отвечать только за отображение и события. Она не должна напрямую вызывать `canvas.*`, `htmlDocuments.*`, `textDocuments.*`, `confirmDelete` или роутерную бизнес-логику.

## Шаг 2. Создать типы карточки

Создать `src/components/dashboard/resource-card.types.ts`:

```ts
export type DashboardResourceKind =
  | 'canvas'
  | 'html-document'
  | 'text-document'
  | 'interactive-template';

export type DashboardResourceAction =
  | 'move'
  | 'duplicate'
  | 'description'
  | 'tags'
  | 'pin'
  | 'transfer'
  | 'delete'
  | 'hide-from-public';

export type DashboardResourceActionItem = {
  key: DashboardResourceAction;
  label: string;
  visible: boolean;
  disabled?: boolean;
  danger?: boolean;
};
```

Если подходящие типы уже есть в `DashboardView.vue`, перенести их сюда и удалить дубликаты. Не создавать вторую несовместимую модель ресурса.

## Шаг 3. Вынести общий компонент карточки

Создать `src/components/dashboard/DashboardResourceCard.vue`.

Компонент должен получать через props:

- `item`;
- `kind`;
- `selected`;
- `selectable`;
- `busy`;
- `menuOpen`;
- `menuStyle`;
- `owned`;
- готовые значения заголовка, пути папки и даты;
- список доступных действий.

Компонент должен эмитить:

```ts
open
toggle-select
toggle-menu
toggle-pin
action
```

Начать с canvas-карточки в `DashboardView.vue` примерно около строк 493–535. Сохранить без изменений:

- `data-select-key`;
- `data-selected`;
- `data-resource-icon`;
- `data-card-menu`;
- `@click.stop` и `@dblclick.stop`;
- aria-label’ы;
- открытие по slug или id;
- selection и pin;
- отображение тегов и мобильной даты.

После переноса canvas-карточки запустить:

```bash
npm run test:unit -- src/views/DashboardView.test.ts
```

## Шаг 4. Перенести HTML и text cards

Заменить аналогичные inline-блоки HTML и text-документов тем же компонентом.

Различия передавать конфигурацией:

- тип ресурса;
- `ResourceIcon` и `ResourceThumb`;
- URL открытия;
- fallback для пустого заголовка;
- действие duplicate/delete;
- accessibility label.

Не создавать отдельные копии компонента для каждого типа ресурса.

## Шаг 5. Вынести меню действий

Создать `src/components/dashboard/DashboardResourceMenu.vue`.

Компонент получает массив `DashboardResourceActionItem` и эмитит выбранное действие:

```vue
<DashboardResourceMenu
  :actions="resourceActions(item)"
  :disabled="isBusy"
  @select="handleResourceAction(item, $event)"
/>
```

В родителе оставить бизнес-функции:

- `duplicateCanvas`;
- `duplicateHtmlDocument`;
- `duplicateTextDocument`;
- `deleteCanvas`;
- `deleteHtmlDocument`;
- `deleteTextDocument`;
- `openDescriptionModal`;
- `openTagsModal`;
- `openTransferModal`;
- `togglePinned`.

Меню не должно знать, какой API вызывается для конкретного типа ресурса.

Для interactive template оставить только реально поддерживаемые действия: перемещение и удаление владельцем.

## Шаг 6. Добавить unit-тесты новых компонентов

Создать:

- `src/components/dashboard/DashboardResourceCard.test.ts`;
- `src/components/dashboard/DashboardResourceMenu.test.ts`.

Проверить минимум:

- fallback title;
- `aria-checked` для selected state;
- корректный emit menu action;
- danger-класс для destructive action;
- скрытие owner-only действий у чужого ресурса;
- disabled state;
- клик по меню не открывает карточку.

## Шаг 7. Проверить старые Dashboard-компоненты

Проверить import graph:

```bash
for f in src/components/dashboard/*.vue; do
  name=$(basename "$f" .vue)
  rg -l "\\b$name\\b" src tests --glob "!$f" >/dev/null \\
    || echo "$f"
done
```

Компоненты, которые сейчас выглядят неиспользуемыми:

- `DashboardAccessRequests.vue`;
- `DashboardAuthHeader.vue`;
- `DashboardFolderSection.vue`;
- `DashboardInteractiveSection.vue`;
- `DashboardModalLayer.vue`;
- `DashboardPublicHeader.vue`;
- `DashboardPublicSection.vue`;
- `DashboardRecentSection.vue`;
- `DashboardSelectionBar.vue`;
- `DashboardSharedSection.vue`;
- `DashboardSpaceSection.vue`;
- `DashboardStatusOverlays.vue`;
- `DashboardToolbar.vue`;
- `DashboardTrashSection.vue`;
- `DashboardYandexSection.vue`.

Не подключать их вслепую: часть содержит устаревшие props и события. После переноса актуальной логики каждый файл нужно либо удалить, либо адаптировать и подключить с тестами.

## Шаг 8. Разбить изменения на коммиты

Рекомендуемый порядок:

```text
refactor(dashboard): extract shared resource card
refactor(dashboard): extract resource action menu
test(dashboard): cover shared resource card actions
chore(dashboard): remove unused section components
```

После каждого коммита запускать:

```bash
npm run test:unit
npm run build
```

## Шаг 9. Финальная проверка

Запустить полный набор:

```bash
npm run test:unit
npm run build
npx playwright test \
  tests/admin-plans.spec.ts \
  tests/dashboard-admin-public.spec.ts \
  tests/dashboard-upload.spec.ts \
  tests/dashboard-spaces.spec.ts \
  tests/sidebar.smoke.spec.ts
npm run test:visual
```

Проверить вручную на dev-стенде:

- открыть Dashboard авторизованным пользователем;
- открыть меню canvas, HTML и text-документа;
- проверить duplicate, delete, move, tags, description, pin и transfer;
- открыть публичный ресурс и ресурс, которым поделились;
- проверить mobile layout и selection;
- проверить interactive template;
- убедиться, что меню не открывает карточку повторным кликом.

## Критерии приёмки

- Dashboard cards используют общий компонент;
- меню действий не продублировано для трёх типов ресурсов;
- API-вызовы остались вне presentation-компонентов;
- сохранены маршруты, slug/id, selection, pin, aria и `data-*` атрибуты;
- чужие ресурсы не получают owner-only actions;
- проходят все текущие unit-тесты и выбранные browser-тесты;
- visual snapshots не меняются без объяснимой причины;
- рабочее дерево не содержит случайных артефактов;
- память проекта не обновляется.

После стабилизации этого блока следующий самостоятельный этап — декомпозиция `DriveView.vue` на toolbar, tree, file card, list row и upload queue.
