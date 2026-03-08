# CLI Implementation Plan

CLI-обёртка над `KSeFClient` для всех сервисов библиотеки.
Фреймворк: `citty`. Инфраструктура (config-store, session-store, output, error-handler, client-factory) уже готова.

Текущее состояние: реализованы только `ksef config` и `ksef auth`.

---

## Фаза 1 — Сессии

Основа для работы со счетами. Без сессий большинство операций невозможно.

### 1.1 `ksef session open`

Открытие онлайн-сессии.

```
ksef session open --nip <nip> [--upo-version <ver>]
```

- Вызывает `client.onlineSession.openSession(request, accessToken)`
- Сохраняет `sessionRef` в session-store
- Выводит sessionRef и статус

### 1.2 `ksef session close`

```
ksef session close [--ref <sessionRef>]
```

- По умолчанию берёт sessionRef из session-store
- Вызывает `client.onlineSession.closeSession(sessionRef, accessToken)`

### 1.3 `ksef session status`

```
ksef session status [<sessionRef>]
```

- Вызывает `client.sessionStatus.getSessionStatus(sessionRef, accessToken)`

### 1.4 `ksef session list`

```
ksef session list --type <online|batch> [--page-size <n>] [--token <cont>]
```

- Вызывает `client.sessionStatus.getSessions(type, accessToken, pageSize, continuationToken)`
- Таблица: ref, type, status, createdAt

### 1.5 `ksef session active`

```
ksef session active [--page-size <n>]
```

- Вызывает `client.activeSessions.getActiveSessions(accessToken)`

### 1.6 `ksef session revoke`

```
ksef session revoke [<sessionRef>]
ksef session revoke --current
```

- `--current` → `revokeCurrentSession(token)`
- Позиционный аргумент → `revokeSession(sessionRef, accessToken)`

### 1.7 `ksef session batch-open` / `ksef session batch-close`

```
ksef session batch-open --nip <nip>
ksef session batch-close --ref <batchRef>
```

- Пакетные сессии — специализированный flow

---

## Фаза 2 — Счета (invoices)

Самая востребованная функциональность для пользователя CLI.

### 2.1 `ksef invoice send`

```
ksef invoice send <file> [--session-ref <ref>]
```

- Читает XML-файл счёта
- Вызывает `client.onlineSession.sendInvoice(sessionRef, request, accessToken)`
- Выводит invoiceRef, ksefNumber

### 2.2 `ksef invoice get`

```
ksef invoice get <ksefNumber> [--out <file>]
```

- Вызывает `client.invoices.getInvoice(ksefNumber, accessToken)`
- Без `--out` выводит XML в stdout, с `--out` сохраняет в файл

### 2.3 `ksef invoice query`

```
ksef invoice query [--nip-sender <nip>] [--nip-recipient <nip>]
    [--date-from <date>] [--date-to <date>]
    [--amount-from <n>] [--amount-to <n>]
    [--page <n>] [--page-size <n>] [--sort <asc|desc>]
```

- Вызывает `client.invoices.queryInvoiceMetadata(filters, accessToken, ...)`
- Таблица: ksefNumber, issueDate, sender, recipient, amount

### 2.4 `ksef invoice export`

```
ksef invoice export [--nip-sender <nip>] [--date-from <date>] [--date-to <date>]
```

- Вызывает `client.invoices.exportInvoices(request, accessToken)`
- Выводит referenceNumber для отслеживания

### 2.5 `ksef invoice export-status`

```
ksef invoice export-status <ref>
```

- Вызывает `client.invoices.getInvoiceExportStatus(ref, accessToken)`

### 2.6 `ksef invoice upo`

```
ksef invoice upo --ksef-number <num> --session-ref <ref>
ksef invoice upo --invoice-ref <ref> --session-ref <ref>
```

- Получение UPO по номеру KSeF или по reference
- Вызывает `getInvoiceUpoByKsefNumber` / `getInvoiceUpoByReference`

### 2.7 `ksef invoice session-list`

```
ksef invoice session-list [--session-ref <ref>] [--failed] [--page-size <n>]
```

- `--failed` → `getSessionFailedInvoices`, иначе `getSessionInvoices`

---

## Фаза 3 — Права доступа (permissions)

### 3.1 `ksef permissions grant`

```
ksef permissions grant --type <person|entity|authorization|indirect|subunit|eu-entity|eu-representative>
    --identifier <value> --identifier-type <nip|pesel|...>
    --read --write [--credential-management]
```

- Маппинг `--type` на соответствующий метод `grant*Permissions`
- Формирует request из аргументов

### 3.2 `ksef permissions revoke`

```
ksef permissions revoke <grantId> [--authorization]
```

- `--authorization` → `revokeAuthorizationGrant`
- Иначе → `revokeCommonGrant`

### 3.3 `ksef permissions query`

```
ksef permissions query --scope <personal|persons|entities|subunits|authorizations|eu-entities|subordinate-entities>
    [--page <n>] [--page-size <n>]
```

- Маппинг `--scope` на соответствующий метод `query*Grants` / `query*Roles`
- Таблица: identifier, permissions, grantedAt

### 3.4 `ksef permissions status`

```
ksef permissions status <ref>
```

- Вызывает `getOperationStatus(ref, accessToken)`

---

## Фаза 4 — Токены и сертификаты

### 4.1 `ksef token generate`

```
ksef token generate --name <name> [--permissions <read,write>]
```

- Вызывает `client.tokens.generateToken(request, accessToken)`

### 4.2 `ksef token list`

```
ksef token list [--page-size <n>]
```

- Вызывает `client.tokens.queryTokens(accessToken, options)`
- Таблица: ref, name, createdAt, status

### 4.3 `ksef token get`

```
ksef token get <ref>
```

- Вызывает `client.tokens.getToken(ref, accessToken)`

### 4.4 `ksef token revoke`

```
ksef token revoke <ref>
```

- Вызывает `client.tokens.revokeToken(ref, accessToken)`

### 4.5 `ksef cert enroll`

```
ksef cert enroll --csr <file>
```

- Вызывает `client.certificates.enroll(request, accessToken)`

### 4.6 `ksef cert list`

```
ksef cert list
```

- Вызывает `client.certificates.retrieve(request, accessToken)`

### 4.7 `ksef cert status`

```
ksef cert status <ref>
```

- Вызывает `client.certificates.getEnrollmentStatus(ref, accessToken)`

### 4.8 `ksef cert revoke`

```
ksef cert revoke <serialNumber>
```

- Вызывает `client.certificates.revoke(serialNumber, request, accessToken)`

### 4.9 `ksef cert limits`

```
ksef cert limits
```

- Вызывает `client.certificates.getLimits(accessToken)`

### 4.10 `ksef cert generate-csr`

```
ksef cert generate-csr --cn <name> --org <org> --country <cc> [--algo <rsa|ecdsa>] [--out <file>]
```

- Вызывает `client.crypto.generateCsrRsa` или `generateCsrEcdsa`
- Сохраняет CSR и приватный ключ

---

## Фаза 5 — Информационные команды

### 5.1 `ksef status`

```
ksef status
```

- Вызывает `client.lighthouse.getStatus()`
- Показывает статус KSeF (доступен/обслуживание/недоступен)

### 5.2 `ksef messages`

```
ksef messages
```

- Вызывает `client.lighthouse.getMessages()`
- Таблица: date, severity, message

### 5.3 `ksef limits`

```
ksef limits [--context | --subject | --rate]
```

- `--context` → `getContextLimits`
- `--subject` → `getSubjectLimits`
- `--rate` → `getRateLimits`
- По умолчанию — все три

### 5.4 `ksef peppol providers`

```
ksef peppol providers [--page <n>] [--page-size <n>]
```

- Вызывает `client.peppol.queryProviders(accessToken)`

### 5.5 `ksef qr`

```
ksef qr <ksefNumber|url> [--format <png|svg|base64>] [--out <file>] [--label <text>]
```

- Генерация QR-кода из ссылки верификации или номера KSeF
- Использует `QrCodeService` напрямую

### 5.6 `ksef qr link`

```
ksef qr link --nip <nip> --date <date> --hash <base64hash>
```

- Вызывает `client.qr.buildInvoiceVerificationUrl(...)`

---

## Фаза 6 — Тестовые данные (только test/demo)

Доступно только в окружениях `test` и `demo`. CLI должен проверять environment перед выполнением.

### 6.1 `ksef test-data subject`

```
ksef test-data subject create --nip <nip> --name <name>
ksef test-data subject remove --nip <nip>
```

### 6.2 `ksef test-data person`

```
ksef test-data person create --pesel <pesel> --name <name>
ksef test-data person remove --pesel <pesel>
```

### 6.3 `ksef test-data permissions`

```
ksef test-data permissions grant --nip <nip> --identifier <id> ...
ksef test-data permissions revoke --nip <nip> --identifier <id> ...
```

### 6.4 `ksef test-data attachment`

```
ksef test-data attachment enable --nip <nip>
ksef test-data attachment disable --nip <nip>
```

### 6.5 `ksef test-data limits`

```
ksef test-data limits session --max-invoices <n>
ksef test-data limits session --restore
ksef test-data limits certs --max <n>
ksef test-data limits certs --restore
ksef test-data limits rate --max <n>
ksef test-data limits rate --restore
ksef test-data limits rate-prod --max <n>
ksef test-data limits rate-prod --restore
```

### 6.6 `ksef test-data context`

```
ksef test-data context block --nip <nip>
ksef test-data context unblock --nip <nip>
```

---

## Структура файлов

```
src/cli/
  index.ts                     # главная точка входа (обновить subCommands)
  types.ts                     # SessionData расширить полем onlineSessionRef
  session-store.ts             # расширить для хранения onlineSessionRef
  commands/
    config.ts                  # [готово]
    auth.ts                    # [готово]
    session.ts                 # Фаза 1
    invoice.ts                 # Фаза 2
    permissions.ts             # Фаза 3
    token.ts                   # Фаза 4.1-4.4
    cert.ts                    # Фаза 4.5-4.10
    status.ts                  # Фаза 5.1-5.2 (lighthouse)
    limits.ts                  # Фаза 5.3
    peppol.ts                  # Фаза 5.4
    qr.ts                      # Фаза 5.5-5.6
    test-data.ts               # Фаза 6
```

---

## Порядок реализации и приоритеты

| Фаза | Команды | Кол-во подкоманд | Приоритет |
|------|---------|------------------|-----------|
| 1 | session | 7 | Высокий — блокирует фазу 2 |
| 2 | invoice | 7 | Высокий — основной use-case |
| 3 | permissions | 4 | Средний |
| 4 | token + cert | 10 | Средний |
| 5 | status, messages, limits, peppol, qr | 6 | Низкий — информационные |
| 6 | test-data | 6 групп | Низкий — только test/demo |

**Итого: ~40 подкоманд** покрывающих все ~80 методов сервисов.

---

## Общие паттерны реализации

1. **Аутентификация**: все команды кроме `status`, `messages` и `config` требуют `requireSession()`
2. **Global options**: `--env`, `--json`, `--timeout`, `--nip` наследуются из config
3. **Пагинация**: `--page-size`, `--page` / `--token` для cursor-based
4. **Вывод**: `outputResult` для объектов, `outputTable` для списков, `outputSuccess` для подтверждений
5. **Файловый I/O**: `--out <file>` для сохранения XML/UPO/QR, stdin/stdout по умолчанию
6. **Session-ref**: многие команды опционально принимают `--session-ref`, по умолчанию из session-store
7. **Environment guard**: команды `test-data` проверяют `environment !== 'prod'`
