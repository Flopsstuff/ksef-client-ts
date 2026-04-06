# Polish Statutory Holidays

Business day calculations for [offline invoice deadlines](./offline-mode.md) exclude weekends **and** Polish statutory holidays, as required by Polish law (Ordynacja podatkowa, art. 12 &sect;5).

## Holiday List

Source: [Ustawa z dnia 18 stycznia 1951 r. o dniach wolnych od pracy](https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=wdu19510040028) (Dz.U. z 2025 r., poz. 296).

### Fixed Holidays (10)

| Date | Name | Notes |
|------|------|-------|
| 1 January | Nowy Rok | New Year's Day |
| 6 January | Trzech Króli | Epiphany |
| 1 May | Święto Państwowe | Labour Day |
| 3 May | Święto Narodowe Trzeciego Maja | Constitution Day |
| 15 August | Wniebowzięcie NMP | Assumption of Mary |
| 1 November | Wszystkich Świętych | All Saints' Day |
| 11 November | Narodowe Święto Niepodległości | Independence Day |
| 24 December | Wigilia Bożego Narodzenia | Christmas Eve (since 2025) |
| 25 December | Boże Narodzenie (1st day) | Christmas Day |
| 26 December | Boże Narodzenie (2nd day) | St. Stephen's Day |

> **Note:** Christmas Eve (24 December) was added by the amendment of 6 December 2024 (Dz.U. 2024, poz. 1965), effective from 1 February 2025. For years before 2025, this date is not treated as a holiday.

### Moveable Holidays (4, Easter-based)

| Holiday | Calculation | Example (2026) |
|---------|-------------|-----------------|
| Wielkanoc (Easter Sunday) | Computus algorithm | 5 April |
| Poniedziałek Wielkanocny (Easter Monday) | Easter + 1 day | 6 April |
| Zielone Świątki (Pentecost) | Easter + 49 days | 24 May |
| Boże Ciało (Corpus Christi) | Easter + 60 days | 4 June |

> Pentecost always falls on a Sunday, so it does not affect business day calculations. It is included for legal completeness.

### Total Count

- **14 holidays** per year (2025 onwards)
- **13 holidays** per year (2024 and earlier, before Wigilia amendment)

## Implementation

The holiday logic is in `src/offline/holidays.ts`:

- **`computeEasterSunday(year)`** — computes Easter Sunday using the Anonymous Gregorian algorithm (Meeus/Jones/Butcher). Pure math, no external dependencies.
- **`getPolishHolidays(year)`** — returns a `Set<string>` of ISO date strings (`YYYY-MM-DD`) for all statutory holidays in the given year. Results are cached per year.
- **`isPolishHoliday(date)`** — checks if a UTC `Date` falls on a Polish statutory holiday.

These functions are used internally by `nextBusinessDay()` and `addBusinessDays()` in `src/offline/deadline.ts`. The integration is transparent — all deadline functions (`calculateOfflineDeadline`, `extendDeadlineForMaintenance`) automatically skip holidays without any API changes.

### Usage

```typescript
import {
  computeEasterSunday,
  getPolishHolidays,
  isPolishHoliday,
  nextBusinessDay,
} from 'ksef-client-ts';

// Easter Sunday for 2026
computeEasterSunday(2026); // → 2026-04-05

// All 14 holidays for 2026
const holidays = getPolishHolidays(2026);
// Set { '2026-01-01', '2026-01-06', '2026-04-05', ... }

// Check a specific date
isPolishHoliday(new Date('2026-12-25')); // → true (Christmas)
isPolishHoliday(new Date('2026-12-27')); // → false

// nextBusinessDay skips holidays automatically
nextBusinessDay(new Date('2026-12-23')); // Wed → Mon Dec 28
// (skips: Thu Dec 24 Wigilia, Fri Dec 25 Christmas, Sat-Sun weekend)
```

## Holiday Clusters

Some holiday combinations create extended non-working periods. Examples for 2026:

| Period | Non-working days | Next business day |
|--------|-----------------|-------------------|
| Christmas 2026 | Dec 24 (Thu, Wigilia) + Dec 25 (Fri) + Dec 26-27 (Sat-Sun) | Mon Dec 28 |
| Easter 2026 | Apr 5 (Sun, Easter) + Apr 6 (Mon, Easter Monday) | Tue Apr 7 |
| May holidays 2026 | May 1 (Fri) + May 2 (Sat) + May 3 (Sun, Constitution Day) | Mon May 4 |

These clusters are handled automatically — `nextBusinessDay()` and `addBusinessDays()` keep advancing until a working day is found.
