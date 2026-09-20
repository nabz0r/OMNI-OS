import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { RedisStore } from "../src/store.mjs";

test(
  "Redis atomically deduplicates concurrent releases and preserves sums after reconnect",
  {
    skip:
      !process.env.OMNI_TEST_REDIS_URL &&
      "Set OMNI_TEST_REDIS_URL to an isolated test Redis database.",
  },
  async () => {
    const client = createClient({ url: process.env.OMNI_TEST_REDIS_URL });
    client.on("error", () => {});
    await client.connect();
    const store = new RedisStore(client);
    const week = "2099-W01";
    const make = () => ({
      schema_version: 1,
      report_id: randomUUID(),
      week,
      epsilon: 1,
      histograms: {
        topics: [-3, 1, 2, 0, 1, 0, 0, 0],
        latency: Array(8).fill(2),
        tokens: Array(8).fill(0),
      },
    });
    const first = make();
    const second = make();
    try {
      const replies = await Promise.all(
        Array.from({ length: 32 }, () => store.add(first)),
      );
      assert.equal(replies.filter((r) => r === "accepted").length, 1);
      assert.equal(replies.filter((r) => r === "duplicate").length, 31);
      const reordered = {
        histograms: {
          tokens: first.histograms.tokens,
          topics: first.histograms.topics,
          latency: first.histograms.latency,
        },
        epsilon: 1,
        week,
        report_id: first.report_id,
        schema_version: 1,
      };
      assert.equal(await store.add(reordered), "duplicate");
      assert.equal(await store.add({ ...first, epsilon: 2 }), "conflict");
      assert.equal(await store.add(second), "accepted");
      const aggregate = await store.latest();
      assert.equal(aggregate.count, 2);
      assert.deepEqual(aggregate.sums.slice(0, 8), [-6, 2, 4, 0, 2, 0, 0, 0]);
      await client.disconnect();
      await client.connect();
      assert.equal(await store.add(first), "duplicate");
      assert.equal((await store.latest()).count, 2);
    } finally {
      // Only this test's IDs and reserved future week are removed.
      await client.hDel("omni:{analytics}:ids", [
        first.report_id,
        second.report_id,
      ]);
      await client.del(`omni:{analytics}:week:${week}`);
      await client.zRem("omni:{analytics}:weeks", week);
      await store.close();
    }
  },
);
