import type { Db, Document } from "mongodb"
import { RUNS_COLLECTION } from "./flows"

// kept + excluded must equal the number of in-month units (rows for per-row
// flows, unique LDTs for deduped flows). A mismatch means the transform
// silently dropped or double-counted — we fail before touching the DB.
export class ReconciliationError extends Error {
  constructor(
    readonly inMonth: number,
    readonly kept: number,
    readonly excluded: number
  ) {
    super(
      `Reconciliation failed: kept ${kept} + excluded ${excluded} = ${kept + excluded} ≠ ${inMonth} in-month`
    )
    this.name = "ReconciliationError"
  }
}

export function reconcile(inMonth: number, kept: number, excluded: number): void {
  if (kept + excluded !== inMonth) {
    throw new ReconciliationError(inMonth, kept, excluded)
  }
}

// Record a failed month so the Flows page can surface it. Runs are the audit
// trail; without this, failures are invisible until a human spots a wrong number.
export async function logRunFailure(
  db: Db,
  rec: {
    flowKey: string
    monthKey: string
    triggeredBy: string
    startedAt: Date
    error: unknown
  }
): Promise<void> {
  await db.collection(RUNS_COLLECTION).insertOne({
    flowKey: rec.flowKey,
    monthKey: rec.monthKey,
    status: "error",
    error: rec.error instanceof Error ? rec.error.message : String(rec.error),
    triggeredBy: rec.triggeredBy,
    startedAt: rec.startedAt,
    finishedAt: new Date(),
    durationMs: Date.now() - rec.startedAt.getTime(),
  })
}

export interface MonthOutcome {
  monthKey: string
  status: "success" | "error"
  error?: string
  [key: string]: unknown
}

// Runs one processMonth per target month with per-month isolation: a failed
// month logs a failure record and is reported, but does not abort the others
// (so a network blip mid-backfill doesn't lose the months that did succeed).
export async function runEtlMonths(
  db: Db,
  opts: {
    flowKey: string
    months: Array<{ year: number; month: number }>
    triggeredBy: string
    monthKeyOf: (y: number, m: number) => string
    processMonth: (y: number, m: number, startedAt: Date) => Promise<Document>
  }
): Promise<MonthOutcome[]> {
  const results: MonthOutcome[] = []
  for (const { year, month } of opts.months) {
    const startedAt = new Date()
    const monthKey = opts.monthKeyOf(year, month)
    try {
      const summary = await opts.processMonth(year, month, startedAt)
      results.push({ monthKey, status: "success", ...summary })
    } catch (error) {
      await logRunFailure(db, { flowKey: opts.flowKey, monthKey, triggeredBy: opts.triggeredBy, startedAt, error })
      results.push({
        monthKey,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}
