## Why

Текущий `exportAndDownload()` workflow выполняет единичный экспорт за один вызов. Если результат усечён (`isTruncated: true`), пользователь должен вручную управлять пагинацией — отслеживать `lastPermanentStorageDate` / `permanentStorageHwmDate`, строить новые фильтры, дедуплицировать по KSeF-номерам. Это сложная и error-prone логика, которую реализуют все 4 референсных проекта (smekcio — полный IncrementalExportWorkflow с HwmCoordinator, C# — E2E паттерны с continuation points). Инкрементальный экспорт — стандартный паттерн работы с KSeF API для больших объёмов фактур.

## What Changes

- Добавляется **HWM Coordinator** — модуль отслеживания continuation points (high-water mark дат по subject type), логика обновления HWM из пакетов экспорта, выбор effective start date
- Добавляется **Incremental Export Workflow** — оркестрация цикла: итеративный экспорт с автоматическим продвижением HWM, дедупликация результатов по KSeF-номерам, configurable max iterations
- Добавляется **HWM Storage Interface** — pluggable интерфейс для персистенции HWM state (in-memory реализация по умолчанию, file-based опционально)
- Расширяются **InvoiceQueryFilters** — добавляется поле `restrictToPermanentStorageHwmDate` для стабилизации snapshot-режима (соответствие C# и OpenAPI spec)
- Расширяется **InvoiceExportWorkflow** — reusable iteration primitive, используется инкрементальным workflow
- Добавляется CLI-команда `ksef invoice export-incremental` — инкрементальный экспорт с сохранением HWM state между запусками

## Capabilities

### New Capabilities
- `hwm-coordinator`: Логика отслеживания и обновления high-water mark continuation points — updateContinuationPoint, getEffectiveStartDate, deduplication по KSeF-номерам
- `incremental-export-workflow`: Оркестрация итеративного экспорта — цикл export→poll→download→advance HWM, с configurable max iterations, filters factory, deduplication, pluggable storage
- `cli-invoice-export-incremental`: CLI-команда для инкрементального экспорта с persistence state между вызовами

### Modified Capabilities
- `cli-invoice`: Добавляется подкоманда `export-incremental` и ссылки на новый workflow в help/docs

## Impact

- **Новые файлы**: `src/workflows/hwm-coordinator.ts`, `src/workflows/incremental-export-workflow.ts`, `src/workflows/hwm-storage.ts`, `src/cli/commands/invoice/export-incremental.ts`
- **Модифицируемые файлы**: `src/models/invoices/types.ts` (добавление `restrictToPermanentStorageHwmDate` в DateRange), `src/workflows/invoice-export-workflow.ts` (экспорт iteration primitive), `src/client.ts` (регистрация нового workflow)
- **Зависимости**: нет новых внешних зависимостей (всё на native Node.js — fs для file-based storage)
- **API**: не-breaking — все изменения аддитивные, существующий `exportAndDownload()` не меняется
- **Тесты**: unit-тесты для HWM coordinator (continuation point логика, dedup), unit+integration для incremental workflow (iteration loop, termination conditions), E2E тест
