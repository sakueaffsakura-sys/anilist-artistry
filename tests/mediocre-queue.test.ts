import { expect, test } from "bun:test";
import { QUEUE_CHAPTER_DELAY_MS } from "../src/lib/mediocre-queue.server";

test("cada capítulo da fila espera 1 minuto", () => {
  expect(QUEUE_CHAPTER_DELAY_MS).toBe(60_000);
});
