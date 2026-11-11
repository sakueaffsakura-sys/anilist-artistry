/** List views need a total and two recent links, not the entire chapter index. */
export const SERIES_SUMMARY_SELECT = "id, slug, title, cover_url, banner_url, synopsis, genres, age_rating, kind, status, rating, views, pinned, in_slider, created_at, updated_at, chapter_count, latest_chapter_number, latest_chapter_at, recent_chapters:chapters(id, number, title, created_at)";

export function chapterCount(work: { chapter_count?: number; chapters?: readonly unknown[] }): number {
  return work.chapter_count ?? work.chapters?.length ?? 0;
}