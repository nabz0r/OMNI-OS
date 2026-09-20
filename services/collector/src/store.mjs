import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

export const GROUPS = ["topics", "latency", "tokens"];
const digest = (report) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        report.schema_version,
        report.report_id,
        report.week,
        report.epsilon,
        ...GROUPS.map((group) => report.histograms[group]),
      ]),
    )
    .digest("hex");
const flatten = (report) => GROUPS.flatMap((group) => report.histograms[group]);

export class SqliteStore {
  constructor(filename = ":memory:") {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, week TEXT NOT NULL, digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS aggregates(week TEXT PRIMARY KEY, count INTEGER NOT NULL, sums TEXT NOT NULL);`);
  }
  async add(report) {
    const hash = digest(report);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.db
        .prepare("SELECT digest FROM reports WHERE id=?")
        .get(report.report_id);
      if (old) {
        this.db.exec("COMMIT");
        return old.digest === hash ? "duplicate" : "conflict";
      }
      const current = this.db
        .prepare("SELECT count,sums FROM aggregates WHERE week=?")
        .get(report.week);
      const values = flatten(report);
      const sums = current
        ? JSON.parse(current.sums).map((v, i) => v + values[i])
        : values;
      this.db
        .prepare("INSERT INTO reports VALUES(?,?,?)")
        .run(report.report_id, report.week, hash);
      this.db
        .prepare("INSERT OR REPLACE INTO aggregates VALUES(?,?,?)")
        .run(report.week, (current?.count ?? 0) + 1, JSON.stringify(sums));
      this.db.exec("COMMIT");
      return "accepted";
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async latest() {
    const row = this.db
      .prepare("SELECT * FROM aggregates ORDER BY week DESC LIMIT 1")
      .get();
    return row
      ? { week: row.week, count: row.count, sums: JSON.parse(row.sums) }
      : null;
  }
  async close() {
    this.db.close();
  }
}

// Deduplication and all 24 sums are changed in one Redis transaction.
const INSERT = `
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then if old == ARGV[2] then return 'duplicate' else return 'conflict' end end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('HINCRBY', KEYS[2], 'count', 1)
for i=1,24 do redis.call('HINCRBYFLOAT', KEYS[2], 'v'..i, ARGV[i+3]) end
redis.call('ZADD', KEYS[3], 0, ARGV[3])
return 'accepted'`;

export class RedisStore {
  constructor(client) {
    this.client = client;
  }
  async add(report) {
    return this.client.eval(INSERT, {
      keys: [
        "omni:{analytics}:ids",
        `omni:{analytics}:week:${report.week}`,
        "omni:{analytics}:weeks",
      ],
      arguments: [
        report.report_id,
        digest(report),
        report.week,
        ...flatten(report).map(String),
      ],
    });
  }
  async latest() {
    const weeks = await this.client.zRange("omni:{analytics}:weeks", -1, -1);
    if (!weeks.length) return null;
    const row = await this.client.hGetAll(`omni:{analytics}:week:${weeks[0]}`);
    return {
      week: weeks[0],
      count: Number(row.count),
      sums: Array.from({ length: 24 }, (_, i) => Number(row[`v${i + 1}`])),
    };
  }
  async close() {
    await this.client.quit();
  }
}
