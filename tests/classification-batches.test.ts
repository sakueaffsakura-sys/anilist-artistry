import { expect, it } from "bun:test";
import { deliverClassificationBatches } from "../src/lib/classification-batches";

it("delivers a finished group while another is still analyzing", async () => {
  let release: ((value: string) => void) | undefined;
  const slow = new Promise<string>((resolve) => { release = resolve; });
  const received: string[] = [];
  const pending = deliverClassificationBatches([[1], [2]], (group) => group[0] === 1 ? slow : Promise.resolve("fast"), (_, result) => received.push(result));
  await Promise.resolve();
  await Promise.resolve();
  expect(received).toEqual(["fast"]);
  release?.("slow");
  await pending;
  expect(received).toEqual(["fast", "slow"]);
});

it("does not deliver a failed group's output", async () => {
  const received: number[] = [];
  await expect(deliverClassificationBatches([[1]], async () => { throw new Error("denied"); }, (group) => received.push(...group))).rejects.toThrow("denied");
  expect(received).toEqual([]);
});