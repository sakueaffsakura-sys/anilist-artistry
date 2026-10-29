import { expect, test } from "bun:test";
import { reelFileError } from "../src/lib/reels";

test("aceita vídeo de 90 segundos e 50 MB", () => {
  expect(reelFileError({ type: "video/mp4", size: 50 * 1024 * 1024 }, 90)).toBeNull();
});
test("recusa vídeo acima de 90 segundos", () => {
  expect(reelFileError({ type: "video/mp4", size: 1000 }, 90.1)).not.toBeNull();
});
test("recusa vídeo acima de 50 MB", () => {
  expect(reelFileError({ type: "video/webm", size: 50 * 1024 * 1024 + 1 }, 10)).not.toBeNull();
});
