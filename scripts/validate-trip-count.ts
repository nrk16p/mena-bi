/**
 * One-off validation of the trip ETL against a target month-year.
 * Fetch is bounded via the (_year,_month,_branch) index; all rules run in
 * application code — no Mongo aggregation. Does NOT write to tripData.
 *
 * Usage: npx tsx scripts/validate-trip-count.ts [year] [month]
 */
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import { buildMonthTrips } from "../lib/trip-count/calculate";
import { buildTripSeedRules } from "../lib/etl/rules-store";
import { DELIVER_DB, fetchDeliverRows } from "../lib/trip-count/source";

const YEAR = Number(process.argv[2] ?? 2026);
const MONTH = Number(process.argv[3] ?? 6);

function loadMongoUri(): string {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("MONGO_URI="));
  if (!line) throw new Error("MONGO_URI not found in .env");
  return line.slice("MONGO_URI=".length).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const client = new MongoClient(loadMongoUri());
  await client.connect();
  const rows = await fetchDeliverRows(client.db(DELIVER_DB), YEAR, MONTH);
  await client.close();
  console.log(`fetched ${rows.length} rows (file-months ±1)\n`);

  const result = buildMonthTrips(rows, YEAR, MONTH, buildTripSeedRules());

  console.log(`=== trip data ${result.monthKey} (ออก LDT month, unique _ldt_base) ===`);
  console.log(`unique LDT   : ${result.uniqueLdt}`);
  console.log(`trips (rows) : ${result.trips.length}`);
  console.log(`excluded     : ${result.excluded.total}`, result.excluded.byRule);
  console.log(`\nsample trip row:`, result.trips[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
