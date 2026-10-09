import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { suggestWorkKind } from "@/lib/work-categories";

export type AnilistResult = {
  anilistId: number;
  title: string;
  altTitles: string;
  synopsis: string;
  coverUrl: string;
  bannerUrl: string;
  genres: string[];
  status: string;
  author: string;
  artist: string;
  averageScore: number;
  suggestedKind: string;
  popularity: number;
  trending: number;
};

const QUERY = `
query ($search: String, $ids: [Int], $sort: [MediaSort]) {
  Page(perPage: 24) {
    media(search: $search, id_in: $ids, type: MANGA, sort: $sort) {
      id
      title { romaji english native }
      description(asHtml: false)
      coverImage { extraLarge large }
      bannerImage
      genres
      status
      averageScore
      popularity
      trending
      countryOfOrigin
      format
      staff(perPage: 6) { edges { role node { name { full } } } }
    }
  }
}`;

const STATUS_PT: Record<string, string> = {
  RELEASING: "Em andamento",
  FINISHED: "Completo",
  NOT_YET_RELEASED: "Em breve",
  CANCELLED: "Cancelado",
  HIATUS: "Hiato",
};

export const searchAnilist = createServerFn({ method: "POST" })
  .inputValidator((input: { search: string }) => z.object({ search: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<AnilistResult[]> => runAnilistSearch(data));

/** Busca no AniList; roda no servidor e, se o AniList bloquear o servidor (403), direto no navegador. */
export async function searchAnilistSmart(search: string, server: (a: { data: { search: string } }) => Promise<AnilistResult[]>) {
  try {
    return await server({ data: { search } });
  } catch (e) {
    if (typeof window !== "undefined" && e instanceof Error && /\((403|5\d\d)\)/.test(e.message)) {
      return runAnilistSearch({ search });
    }
    throw e;
  }
}

async function runAnilistSearch(data: { search: string }): Promise<AnilistResult[]> {
  {
    const gql = (query: string, variables: Record<string, unknown>) =>
      fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(typeof window === "undefined" ? { "User-Agent": "BetterManga/1.0 (+https://bettermanga.net)" } : {}),
        },
        body: JSON.stringify({ query, variables }),
      });
    const raw = data.search.trim();
    let variables: Record<string, unknown> = { search: raw, sort: ["SEARCH_MATCH"] };
    const url = /anilist\.co\/(manga|anime|search)\/?(\d+)?/i.exec(raw);
    if (url) {
      const [, kind, id] = url;
      if (kind === "manga" && id) variables = { ids: [Number(id)] };
      else if (kind === "anime" && id) {
        // Anime link: import the manga it is based on
        const r = await gql(
          `query ($id: Int) { Media(id: $id, type: ANIME) { relations { edges { relationType node { id type } } } } }`,
          { id: Number(id) },
        );
        if (!r.ok) throw new Error(`Não foi possível ler o anime no AniList (${r.status}).`);
        const j = (await r.json()) as { data?: { Media?: { relations?: { edges?: Array<{ node?: { id: number; type: string } }> } } } };
        const ids = (j.data?.Media?.relations?.edges ?? []).flatMap((edge) => edge.node?.type === "MANGA" ? [edge.node.id] : []);
        if (!ids.length) throw new Error("Esse anime não tem mangá de origem no AniList.");
        variables = { ids };
      } else {
        // Link de busca do AniList (ex.: /search/manga?search=Naruto)
        const params = new URL(raw.startsWith("http") ? raw : `https://${raw}`).searchParams;
        const q = params.get("search") ?? params.get("query");
        variables = q ? { search: q, sort: ["SEARCH_MATCH"] } : { sort: [params.get("sort") === "TRENDING_DESC" ? "TRENDING_DESC" : "POPULARITY_DESC"] };
      }
    }
    let response = await gql(QUERY, variables);
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      response = await gql(QUERY, variables);
    }
    if (response.status === 429) throw new Error("AniList está limitando as buscas. Aguarde um minuto e tente de novo.");

    if (!response.ok) {
      throw new Error(`Não foi possível buscar no AniList (${response.status}).`);
    }

    const json = (await response.json()) as {
      data?: { Page?: { media?: unknown[] } };
      errors?: { message: string }[];
    };
    const apiError = json.errors?.[0];
    if (apiError) throw new Error(apiError.message);

    const media = (json.data?.Page?.media ?? []) as Array<{
      id: number;
      title: { romaji?: string; english?: string; native?: string };
      description?: string;
      coverImage?: { extraLarge?: string; large?: string };
      bannerImage?: string;
      genres?: string[];
      status?: string;
      averageScore?: number;
      popularity?: number;
      trending?: number;
      countryOfOrigin?: string;
      format?: string;
      staff?: { edges?: Array<{ role?: string; node?: { name?: { full?: string } } }> };
    }>;

    return media.map((item) => {
      const edges = item.staff?.edges ?? [];
      const findRole = (needle: string) =>
        edges.find((edge) => (edge.role ?? "").toLowerCase().includes(needle))?.node?.name?.full ?? "";
      const titles = [...new Set([item.title.english, item.title.romaji, item.title.native])].filter(Boolean) as string[];
      return {
        anilistId: item.id,
        title: titles[0] ?? "Sem título",
        altTitles: titles.slice(1).join(", "),
        synopsis: decode((item.description ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim(),
        coverUrl: item.coverImage?.extraLarge ?? item.coverImage?.large ?? "",
        bannerUrl: item.bannerImage || item.coverImage?.extraLarge || item.coverImage?.large || "",
        genres: item.genres ?? [],
        status: STATUS_PT[item.status ?? ""] ?? "Em andamento",
        author: findRole("story") || findRole("original") || "",
        artist: findRole("art") || "",
        suggestedKind: suggestWorkKind(item),
        popularity: item.popularity ?? 0,
        trending: item.trending ?? 0,
        averageScore: item.averageScore ? Math.round((item.averageScore / 10) * 10) / 10 : 0,
      };
    });
  }
}

function decode(text: string) {
  return text
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}
