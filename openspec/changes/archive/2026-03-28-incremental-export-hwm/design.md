## Context

Текущий `invoice-export-workflow.ts` предоставляет два метода: `exportInvoices()` и `exportAndDownload()`. Оба выполняют один цикл export→poll→download. Если KSeF API возвращает усечённый пакет (`isTruncated: true`), клиент получает `lastPermanentStorageDate` и `permanentStorageHwmDate` — но никакой автоматической пагинации нет.

Тип `InvoiceExportPackage` уже содержит все необходимые HWM-поля (`isTruncated`, `lastPermanentStorageDate`, `permanentStorageHwmDate`). Тип `InvoiceQueryDateRange` уже содержит `restrictToPermanentStorageHwmDate`. `ExportResult` в `workflows/types.ts` уже возвращает `isTruncated` и `permanentStorageHwmDate`. Таким образом, модели готовы — нужна только оркестрация.

Workflows в проекте — функциональные (stateless-функции, не классы). `KSeFClient` не имеет property `workflows` — workflows импортируются напрямую. CLI уже имеет `invoice` command group с подкомандами `export`, `export-status`, `export-download`.

## Goals / Non-Goals

**Goals:**
- Автоматическая итеративная выгрузка фактур с продвижением HWM по `permanentStorageDate`
- Дедупликация результатов по KSeF-номерам (перекрытие окон порождает дубли)
- Pluggable storage для сохранения HWM state между запусками
- CLI-команда для инкрементального экспорта с file-based persistence
- Пользовательская `filtersFactory` для кастомизации фильтров на каждой итерации

**Non-Goals:**
- Изменение существующих `exportInvoices()` / `exportAndDownload()` — они остаются as-is
- Встроенная распаковка ZIP-архивов (это отдельный P3.7)
- Параллельные итерации (итерации строго последовательны, параллелизм — P4.6)
- Встроенная обработка metadata.json из ZIP (UPO parsing — P3.2)
- Классовые workflow — сохраняем функциональный стиль проекта

## Decisions

### 1. HWM Coordinator — stateless utility functions

**Решение:** Три чистые функции в `src/workflows/hwm-coordinator.ts`, без классов.

**Почему:** Все существующие workflows — функциональные (`exportInvoices()`, `exportAndDownload()`, `pollUntil()`). Класс `HwmCoordinator` из smekcio избыточен — те же 3 функции без state. Чистые функции проще тестировать и композировать.

```typescript
// ContinuationPoints — Record, мутируется in-place (как в smekcio и C#)
type ContinuationPoints = Record<string, string | undefined>;

function updateContinuationPoint(
  points: ContinuationPoints,
  subjectType: string,
  pkg: InvoiceExportPackage,
): void;

function getEffectiveStartDate(
  points: ContinuationPoints,
  subjectType: string,
  windowFrom: string,
): string;

function deduplicateByKsefNumber(
  metadataEntries: InvoiceMetadata[],
): InvoiceMetadata[];
```

**Альтернатива:** Класс `HwmCoordinator` (smekcio). Отклонено — не соответствует стилю проекта, добавляет ненужную инстанцирование.

### 2. Continuation Point update — приоритет полей

**Решение:** Тот же алгоритм, что в smekcio и C# (проверенный паттерн):

1. `isTruncated && lastPermanentStorageDate` → используем `lastPermanentStorageDate` (последняя дата в усечённом пакете = точка продолжения)
2. `permanentStorageHwmDate` exists → используем его (стабильный HWM из snapshot-режима)
3. Иначе → удаляем запись (`delete points[subjectType]`) — экспорт для этого subject type завершён

**Почему:** Этот приоритет задокументирован в KSeF API. `lastPermanentStorageDate` при усечении точнее указывает, где остановился API. `permanentStorageHwmDate` — fallback для полных (не усечённых) пакетов.

### 3. Incremental Export — функция, оборачивающая doExport()

**Решение:** Новая функция `incrementalExportAndDownload()` в `src/workflows/incremental-export-workflow.ts`, переиспользующая внутренний `doExport()` из `invoice-export-workflow.ts`.

```typescript
interface IncrementalExportOptions {
  subjectType: InvoiceSubjectType;
  windowFrom: string;
  windowTo: string;
  continuationPoints: ContinuationPoints;
  maxIterations?: number;          // default: 20
  filtersFactory?: (from: string, to: string) => InvoiceQueryFilters;
  pollOptions?: PollOptions;
  onlyMetadata?: boolean;
  transport?: typeof fetch;
  onIterationComplete?: (iteration: number, result: ExportResult) => void;
}

interface IncrementalExportResult {
  referenceNumbers: string[];
  invoices: InvoiceMetadata[];     // deduplicated
  decryptedParts: Uint8Array[];    // consolidated from all iterations
  continuationPoints: ContinuationPoints;
  iterationCount: number;
}
```

**Для этого** `doExport()` нужно экспортировать из `invoice-export-workflow.ts` (сейчас private). Минимальное изменение — добавить `export` к существующей функции.

**Алгоритм iteration loop:**
```
for i = 0..maxIterations:
  effectiveFrom = getEffectiveStartDate(points, subjectType, windowFrom)
  if effectiveFrom === previousFrom → break (нет продвижения)
  filters = filtersFactory?.(effectiveFrom, windowTo) ?? defaultFilters(...)
  { result, encData } = doExport(client, filters, ...)
  download + decrypt parts
  updateContinuationPoint(points, subjectType, result.package)
  if !result.isTruncated → break (всё выгружено)
```

**Альтернатива:** Отдельная абстракция `ExportIteration` + `ExportOrchestrator`. Отклонено — over-engineering для одного loop.

### 4. Termination conditions — 3 стопа

**Решение:** Итерационный цикл завершается при любом из:
1. **Нет продвижения** — `effectiveFrom` не изменился (защита от бесконечного цикла)
2. **Не усечено** — `isTruncated === false` (всё выгружено за одну итерацию)
3. **Лимит итераций** — достигнут `maxIterations` (default 20, как в smekcio)

**Почему:** Condition #1 — safety valve (если API вернул одни и те же данные). #2 — happy path. #3 — protection от бесконечных объёмов.

### 5. Deduplication — по ksefNumber, case-insensitive

**Решение:** `deduplicateByKsefNumber()` принимает `InvoiceMetadata[]`, возвращает массив уникальных записей. Ключ — `metadata.ksefNumber.toLowerCase()`, сохраняется первое вхождение.

**Почему:** KSeF-номера уникальны, но при перекрывающихся временных окнах (continuation point может повторить граничные фактуры) нужна дедупликация. Case-insensitive — защита от edge case в API.

**Зависимость:** Функция требует parsed metadata. Текущий `exportAndDownload()` возвращает `decryptedParts: Uint8Array[]` (зашифрованные ZIP-архивы). Metadata extraction из ZIP — это UPO parsing (P3.2). На данном этапе `deduplicateByKsefNumber()` доступен как утилита, но автоматическая дедупликация в `incrementalExportAndDownload()` работает только если пользователь предоставляет metadata через callback `onIterationComplete`.

**Interim решение:** `IncrementalExportResult.invoices` пуст по умолчанию. Если пользователь парсит metadata из ZIP, он может передать результаты через опциональный `metadataExtractor` callback. Полная интеграция — после P3.2 (UPO Parsing).

### 6. HWM Storage — interface + 2 реализации

**Решение:** Интерфейс в `src/workflows/hwm-storage.ts`:

```typescript
interface HwmStore {
  load(): Promise<ContinuationPoints>;
  save(points: ContinuationPoints): Promise<void>;
}
```

Две реализации:
- `InMemoryHwmStore` — для тестов и одноразовых запусков (default)
- `FileHwmStore` — JSON-файл на диске, для CLI

**Почему:** Pluggable storage — стандартный паттерн (smekcio использует interface без built-in persistence, C# тоже). Две реализации покрывают основные сценарии. Пользователь может реализовать свой store (Redis, DB).

**Альтернатива:** Только `ContinuationPoints` object, без storage interface (как в smekcio). Отклонено — мы добавляем CLI-команду, для которой нужен file persistence между запусками.

### 7. CLI — `ksef invoice export-incremental`

**Решение:** Новая подкоманда в `src/cli/commands/invoice/export-incremental.ts`:

```
ksef invoice export-incremental \
  --from 2026-01-01 --to 2026-03-01 \
  --subject-type Subject1 \
  --state-file ./hwm-state.json \
  --max-iterations 20 \
  --output-dir ./exports/
```

- `--state-file` — путь к JSON-файлу HWM state (создаётся автоматически)
- `--output-dir` — директория для сохранения decrypted ZIP частей
- По умолчанию использует `FileHwmStore`
- Показывает прогресс: iteration N, invoices found, HWM advanced to...

**Почему:** CLI-пользователям нужен persistent state между запусками без написания кода. File-based — самый простой и портативный вариант.

### 8. Интеграция с KSeFClient — без изменений

**Решение:** Incremental export workflow остаётся standalone функцией (как `exportAndDownload()`). Не добавляем `client.workflows` property.

**Почему:** Текущие workflows импортируются напрямую: `import { exportAndDownload } from 'ksef-client-ts/workflows'`. Тот же паттерн для `incrementalExportAndDownload()`. Нет необходимости менять `KSeFClient` class.

## Risks / Trade-offs

**[Metadata dedup без ZIP parsing]** → Без P3.2 (UPO Parsing) автоматическая дедупликация по KSeF-номерам невозможна внутри workflow, т.к. мы не парсим metadata.json из ZIP. Mitigation: предоставляем `deduplicateByKsefNumber()` как утилиту + опциональный `metadataExtractor` callback. Полная интеграция после P3.2.

**[Snapshot mode зависит от API]** → `restrictToPermanentStorageHwmDate: true` стабилизирует HWM, но API может вести себя по-разному в разных средах (Test vs Prod). Mitigation: поле уже есть в наших типах, тесты проверят поведение в Test-среде.

**[Rate limiting при множественных итерациях]** → 20 итераций = 20 export requests + 20× polling. Может вызвать 429 ошибки. Mitigation: наш `RetryPolicy` с exponential backoff обрабатывает 429 автоматически. `RateLimitPolicy` (token bucket) тоже помогает.

**[maxIterations = 20 может быть мало]** → Для очень больших объёмов 20 итераций может не хватить. Mitigation: configurable parameter, пользователь может увеличить. CLI тоже поддерживает `--max-iterations`.

**[File-based HWM store — race conditions]** → Два параллельных CLI-запуска с одним state-file могут конфликтовать. Mitigation: документируем, что одновременный доступ не поддерживается. Lockfile — over-engineering для CLI use case.
