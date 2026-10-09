import { expect, test } from "bun:test";
import { playMaintenanceAudio } from "../src/lib/maintenance-audio";

test("maintenance video enables audio at full volume", async () => {
  const video = { muted: true, volume: 0, play: async () => {} };
  expect(await playMaintenanceAudio(video)).toBe(true);
  expect(video.muted).toBe(false);
  expect(video.volume).toBe(1);
});

test("blocked audio keeps video playing muted until a fresh interaction", async () => {
  let calls = 0;
  const video = { muted: true, volume: 0, play: async () => {
    calls++;
    if (!video.muted) throw new Error("Autoplay blocked");
  } };
  expect(await playMaintenanceAudio(video)).toBe(false);
  expect(video.muted).toBe(true);
  expect(calls).toBe(2);
  video.play = async () => {};
  expect(await playMaintenanceAudio(video)).toBe(true);
  expect(video.muted).toBe(false);
});