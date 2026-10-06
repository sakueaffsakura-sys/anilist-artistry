import {
  NOVEL_IMPORT_MAX_BYTES,
  NOVEL_IMPORT_MAX_REDIRECTS,
  NOVEL_IMPORT_TIMEOUT_MS,
  validateNovelImportUrl,
} from "./novel-import-policy";

/** Web APIs only: safe in the hosted runtime. Abort covers headers and body. */
export async function fetchNovelHtml(raw: string, fetcher: typeof fetch = fetch): Promise<string> {
  let url = validateNovelImportUrl(raw);
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      void reader?.cancel().catch(() => undefined);
      reject(new Error("O site demorou mais de 10 segundos para responder."));
    }, NOVEL_IMPORT_TIMEOUT_MS);
  });

  const read = async () => {
    for (let redirects = 0; ; redirects++) {
      const response = await fetcher(url.toString(), {
        headers: { "User-Agent": "BetterMangaBot/1.0", Accept: "text/html, application/xhtml+xml" },
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (redirects >= NOVEL_IMPORT_MAX_REDIRECTS) throw new Error("O link redireciona muitas vezes.");
        const location = response.headers.get("location");
        if (!location) throw new Error("O site enviou um redirecionamento inválido.");
        url = validateNovelImportUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`O site respondeu com erro ${response.status}.`);
      }
      const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (type !== "text/html" && type !== "application/xhtml+xml") {
        await response.body?.cancel();
        throw new Error("O link precisa retornar uma página HTML.");
      }
      const length = Number(response.headers.get("content-length"));
      if (length > NOVEL_IMPORT_MAX_BYTES) {
        await response.body?.cancel();
        throw new Error("A página ultrapassa o limite de 3 MB.");
      }
      if (!response.body) throw new Error("A página retornou uma resposta vazia.");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parts: string[] = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > NOVEL_IMPORT_MAX_BYTES) throw new Error("A página ultrapassa o limite de 3 MB.");
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
      return parts.join("");
    }
  };
  try {
    return await Promise.race([read(), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await reader?.cancel().catch(() => undefined);
  }
}