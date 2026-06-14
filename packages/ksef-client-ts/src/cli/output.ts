import { consola } from 'consola';
import Table from 'cli-table3';

export function outputResult(data: unknown, opts: { json?: boolean }): void {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    consola.log(data);
  }
}

export function outputTable(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  opts: { json?: boolean },
): void {
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const table = new Table({
    head: columns.map((c) => c.label),
  });

  for (const row of rows) {
    table.push(columns.map((c) => String(row[c.key] ?? '')));
  }

  console.log(table.toString());
}

export function outputKeyValue(
  entries: Record<string, unknown>,
  opts: { json?: boolean },
): void {
  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  const table = new Table();
  for (const [key, value] of Object.entries(entries)) {
    table.push({ [key]: String(value ?? '') });
  }
  console.log(table.toString());
}

export function outputSuccess(msg: string): void {
  consola.success(msg);
}

export function outputWarning(msg: string): void {
  consola.warn(msg);
}
