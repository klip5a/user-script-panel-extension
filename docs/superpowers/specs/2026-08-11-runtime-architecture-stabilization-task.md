# ТЗ для новой задачи: стабилизация архитектуры runtime

## Готовый текст задачи

Реализуй стабилизацию архитектуры расширения в репозитории
`/Users/maksim/Dev/user-script-panel-extension`.

Перед началом полностью прочитай:

1. инструкции `AGENTS.md`, переданные окружением;
2. утверждённую спецификацию
   `docs/superpowers/specs/2026-08-11-runtime-architecture-stabilization-design.md`;
3. текущий незакоммиченный diff и связанный код.

Спецификация утверждена пользователем. Повторное согласование архитектуры не требуется, если локальное состояние соответствует описанному ниже.

### Обязательный порядок работы

1. Основной GPT сначала показывает точный рабочий план на основе утверждённой спецификации.
2. Основной GPT сам не пишет и не изменяет программный код.
3. Всю реализацию программного кода обязательно передать агенту `deepseek_worker`.
4. Нельзя заменять `deepseek_worker` обычным `worker` без отдельного разрешения пользователя.
5. После реализации основной GPT самостоятельно запускает все проверки из раздела «Проверки».
6. Затем основной GPT передаёт полный итоговый diff агенту `reviewer`.
7. Если `reviewer` находит P0, P1 или P2-дефекты, исправления обязательно возвращаются тому же `deepseek_worker`.
8. После исправлений повторяются все проверки и review до отсутствия P0/P1/P2 findings.
9. В финальном отчёте перечислить использованных агентов, их роли и модели.

Если `deepseek_worker` недоступен, не писать код самостоятельно: сообщить точную ошибку и остановить реализацию.

### Исходное состояние, которое необходимо сохранить

В worktree уже находятся пользовательские незакоммиченные изменения:

- `entrypoints/sidepanel/SidePanel.tsx`;
- `src/runtime/applyContentSettings.ts`;
- `src/settings/extensionSettings.ts`;
- `src/settings/storage.ts`.

Они добавляют независимые настройки подсветки пустых свойств и мини-панели. Их нельзя откатывать, перезаписывать старой версией или исключать из итогового diff.

Требуемые инварианты:

- включение мини-панели атомарно включает подсветку;
- выключение подсветки атомарно выключает мини-панель;
- старое сохранённое состояние `panelVisible=true` эффективно включает подсветку;
- при выключенных обоих флагах аудит полностью останавливается и очищает DOM.

Не изменяй утверждённую design-спецификацию. Не создавай коммиты, если пользователь отдельно этого не попросит.

## Обязательный scope реализации

### 1. Восстановить TypeScript quality gate

- Добавить отсутствующий импорт типа `ComponentParamsRow` в `component-params-visibility.tsx`.
- Удалить неиспользуемый `applyVisibilityToDialog` или включить его в реальный execution path.
- Не ослаблять настройки TypeScript.
- `pnpm run typecheck` должен проходить.

### 2. Устранить гонку отложенного применения settings

- Вынести orchestration из `entrypoints/content.ts` в небольшой тестируемый runtime-controller либо эквивалентный изолированный модуль.
- Хранить один актуальный snapshot настроек.
- Обновлять snapshot при каждом storage change до любого применения.
- Idle/timer callback обязан читать актуальное состояние в момент выполнения и не может повторно применить старый captured snapshot.
- Раздельно учитывать состояния `scheduled` и `applied`.
- Отменять или инвалидировать устаревшие deferred-задачи.
- Сохранить немедленное применение критических CSS-настроек и текущую семантику отложенного запуска DOM-фич.
- При invalidation/dispose удалять слушатели и отменять pending timers/idle work.

### 3. Изолировать feature orchestration

- В runtime добавить небольшой registry/adaptor слой с единым контрактом `start/stop` и enable predicate.
- Ошибка одной feature должна логироваться с её именем и не прерывать применение остальных.
- Текущее always-on поведение существующих инструментов пока сохранить.
- Не выполнять большой rewrite всех feature-сервисов и не менять их бизнес-правила.

### 4. Сделать settings storage отказоустойчивым

- При ошибке `chrome.storage.local.get` возвращать безопасные defaults и сохранять работу runtime.
- Не допускать unhandled promise rejections в storage subscriptions.
- Side panel должен откатывать или перечитывать optimistic state при ошибке записи, чтобы UI не показывал несохранённое значение.
- Валидировать полученные значения как boolean и игнорировать повреждённые значения.
- Сохранить атомарную запись связанных флагов панели/подсветки.

### 5. Исключить потерю shared storage updates

- Все read-modify-write операции над шаблонами свойств и сохранёнными шапками разделов выполнять через один authoritative background coordinator.
- Клиенты из side panel и content script используют типизированные runtime messages.
- Background обрабатывает мутации через одну последовательную очередь и читает актуальное значение непосредственно перед операцией.
- Reject одной операции не должен останавливать следующие операции очереди.
- Чтения и watch subscriptions могут остаться в вызывающих контекстах.
- Парсинг, валидация и чистые функции изменения store отделить от browser messaging и покрыть unit-тестами.
- Сохранить существующие storage keys и schemas; миграция с потерей данных запрещена.
- Для API WXT использовать актуальную документацию Context7, а не предположения по памяти.

### 6. Исправить ownership `SectionFilterSearch`

- Для каждого helper хранить state с helper DOM, results portal, listener refs и cleanup-функцией.
- При detach поля, AJAX-замене и `stop()` удалять portal и все `window`/`document` listeners.
- Учитывать `removedNodes` или регулярно prune-ить detached states.
- Повторные start/stop и AJAX-замены не должны создавать дубликаты или orphan DOM.

### 7. Исправить cleanup `ImageInfoHighlight`

- Хранить ссылки на `load`, `mouseenter`, `mouseleave` listeners.
- Снимать их и очищать refresh callbacks при удалении target и при `stop()`.
- Защитить async metadata completion generation token или аналогичным способом.
- После повторных off/on один DOM event должен обрабатываться ровно один раз.

### 8. Привязать оставшиеся async-задачи к lifecycle

- `ProductMassEditor` должен владеть `AbortController` для запросов связанных значений.
- Запросы отменяются при close/stop и при замене более новым запросом.
- HTTP-ответы с `response.ok === false` не парсятся как успешный HTML.
- `CatalogEmptyPropertiesAudit.loadPanelState()` должен игнорировать completion от старого generation после stop/restart.
- Все cleanup-пути должны быть идемпотентны.

### 9. Добавить тестовый контур

- Добавить `pnpm test` на основе встроенного `node:test`; новую production dependency не добавлять.
- Сохранить и запускать существующий `tests/analyzeSeoSortSequence.test.ts`.
- Добавить узкие regression tests для:
  - latest-settings-wins при отложенном callback;
  - продолжения registry после исключения одной feature;
  - storage defaults/валидации/invariant панели;
  - атомарной записи связанных settings;
  - последовательной background queue и продолжения после reject;
  - чистых template/header mutations без потери чужих записей;
  - cleanup `SectionFilterSearch`;
  - повторного start/stop `ImageInfoHighlight`;
  - stale panel-state completion;
  - abort запросов `ProductMassEditor`.

Допускаются узкие browser/DOM fakes. Не устанавливать тяжёлый browser-test framework только для этой задачи.

## Проверки

После реализации обязательно выполнить:

```bash
pnpm test
pnpm run typecheck
pnpm run build
pnpm run build:firefox
git diff --check
```

Дополнительно проверить `git status --short`, чтобы убедиться, что существующие пользовательские изменения сохранены, а generated build output не попал в diff.

## Критерии приёмки

- Все обязательные команды завершаются успешно.
- Rapid toggles не откатываются старым deferred callback.
- Исключение одной feature не блокирует запуск остальных.
- Параллельные template/header mutations не теряют обновления.
- Storage failure не отключает runtime и не оставляет side panel в ложном optimistic state.
- AJAX replacement и повторные start/stop не оставляют известных orphan portals, duplicated listeners или stale async mutations в исправленных feature.
- Chrome MV3 и Firefox production builds проходят.
- Текущий dirty diff пользователя сохранён.
- Финальный `reviewer` не сообщает P0/P1/P2 findings.

## Вне scope

- Полный dependency-injection rewrite всех feature-сервисов.
- Объединение всех `MutationObserver` в один глобальный observer.
- Route-aware code splitting и lazy imports.
- Редизайн UI и изменение Bitrix selectors/бизнес-правил.
- Изменение согласованного default новой настройки подсветки.

## Формат финального отчёта

1. Краткий результат.
2. Основные архитектурные изменения.
3. Список изменённых файлов.
4. Результаты каждой команды проверки.
5. Итог reviewer и выполненные по его замечаниям исправления.
6. Оставшиеся риски, если они есть.
7. Таблица агентов: canonical task name, роль, модель, выполненная работа.
