<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Load database-backed SEO metadata in route loaders for shareable initial HTML.
- Sitemap: only public static pages and public community lists; work pages require an account and a chosen profile, so they are excluded.
- Work pages (`/catalogo`, `/obra/*`) live under `_authenticated` and require both sign-in and a chosen profile (`hasProfileChosen` in `src/lib/active-profile.ts`, set by `switchTo`); gates redirect to `/perfis` and the fullscreen picker blocks the app until a profile is picked.
- Keep work rankings at `/ranking` and reader XP rankings at `/ranking-leitores` to separate audiences.
- Use Sora headings and Manrope body; profiles contain dense achievements in a scannable bento layout.
- Shared presentation uses semantic CSS tokens and scoped site-content/site-header/admin classes; reader dimensions and user-selected reading preferences remain independent.
- Keep novels on the shared work details route, but give them a dedicated text reader while manga/comics retain the image reader, so both formats share catalog data without compromising reading ergonomics.
- Novel narration uses Lovable AI TTS via the signed-in /api/tts route with device speech as fallback, because AI voices sound natural while fallback keeps reading working.
- Remote novel imports enforce an exact server host allowlist, deadline and byte budget; revalidate every redirect.
- Bun regression tests live in tests/ outside the application compiler inputs so test-runner globals do not change the hosted runtime's DOM types.
- Maintenance uses singleton settings and restrictive RLS; request middleware gates documents/API, function middleware gates RPCs where metadata is available. Verified admin bearer sessions bridge refresh via a short-lived HTTP-only cookie, never client roles. Media uses a private bucket and renewable signed URLs.
- Browser maintenance status uses a public HTTP projection, SSR a server function; failed checks fail closed to avoid blank notices or bypasses.
- Maintenance backgrounds use lazy-loaded TUS uploads in 6 MiB chunks with session refresh, retries and real progress; storage validation accepts preflight contentLength or legacy null metadata and completed size, while admin-only policies and bucket limits remain mandatory so resumable authorization does not reject valid uploads.
- Maintenance video audio uses a shared playback helper with muted fallback, interaction retry and visibility resume; preview listeners stay scoped so browser autoplay restrictions do not stop the video.
- cPanel uses CPANEL_BUILD=1 and Nitro node-server; app.cjs validates output/config via scripts/cpanel-runtime.cjs and honors Passenger ports without changing hosted builds.
- Session state is provided once by SessionProvider in the root; useSession consumes it so repeated catalog cards do not create individual auth subscriptions.
- Global click audio uses one client-only player and delegated document listener mounted in the root, so navigation preserves playback without per-control subscriptions.
- The shared header uses CSS sticky positioning without scroll-driven React state; the hero pauses its timer outside the viewport to avoid unnecessary work during scrolling.
- Work requests and availability notifications are user-scoped tables; database triggers fulfill exact title/type matches on publication and an admin-only RPC resolves other matches atomically, so imports and manual publications share one notification path.
- Share work categories and age-rating display through browser-safe modules and one badge component, so filters, cards, details, shelves and the panel stay consistent.

- Novel illustrations use validated standalone image markers in chapters.content and a browser-safe shared HTML parser; reader and preview consume ordered blocks, and narration receives empty image entries to preserve paragraph indexes without speaking URLs.
- Work TXT imports parse page links and write sequentially through the authenticated client, never Storage; image and novel imports share filename parsing and numeric sorting for consistent numbering.

- Genre selectors, import writes and public genre labels use the browser-safe work-genres module; alias-aware catalog filtering preserves old records without bulk rewrites.
- Homepage discovery shelves use admin-only persisted selection settings and lightweight published-work queries; automatic ordering uses saved AniList metrics so home visits never call AniList, while manual selection preserves its order without fallback.
- Recent updates uses the shared horizontal shelf and browser-safe selection helper for both query and display limits, keeping layout and result counts consistent.
- Novel file imports use a browser-safe text parser and sequential authenticated chapter writes with an explicit review step; original TXT/HTML files never enter Storage, preserving illustrations without retaining source files.
- List queries use aggregate chapter totals and aliased bounded previews; details cache full indexes separately from reader content to avoid oversized downloads.

- Use RLS reads and server APK signing; minimum-only edits preserve files and publication.
- Follow docs/MIGRATIONS.md; never auto-run unjournaled SQL containing pending changes.

- Classification uses admin RLS/CAS approval, independently delivered parallel groups and paged review rendering. AI streams with lease/pause; manual AniList search loads on selection and requires identity choice, no AI credits or inferred age.

- DB title claims guard writes; duplicate scans mirror normalization, paginate published works and confirm individual RLS deletes.
- Account sub-profiles: the main profile is an implicit sentinel UUID (`MAIN_PROFILE_ID`), extra profiles live in `account_profiles`; reading_history/favorites are keyed by profile_id, and the active profile is a client store (`src/lib/active-profile.ts`) read by query helpers so existing rows stay on the main profile without backfill.

- Discovery/collection reuse LibraryBits and URL filters; tools mount on expansion. AdminShell owns studio navigation, independent of public headers/readers.
