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

- Subdirectories have their own AGENTS.md (src/lib/AGENTS.md: maintenance, novels, chapter imports); read it before changing files there.
- Load DB-backed SEO metadata in loaders.
- Sitemap: only public static pages and public community lists; work pages require an account and a chosen profile, so they are excluded.
- Work pages (`/catalogo`, `/obra/*`) live under `_authenticated` and require both sign-in and a chosen profile (`hasProfileChosen` in `src/lib/active-profile.ts`, set by `switchTo`); gates redirect to `/perfis` and the fullscreen picker blocks the app until a profile is picked.
- Work rankings: `/ranking`; reader XP: `/ranking-leitores`.
- Use Sora headings and Manrope body; profiles contain dense achievements in a scannable bento layout.
- Visual identity "tinta & retícula": ink background, paper-colored text, brand orange; shelf titles are narration boxes (`section-title`, paper box with a hard orange offset shadow), covers and highlights use panel frames with hard shadows, and screentone dots (`--tone-dot`) appear only on the home highlight, the work header and the chapter ending. Motion is limited to the highlight entrance and responses to the reader's own actions; no ambient layers or pointer-tracking glows.
- Shared presentation uses semantic CSS tokens and scoped site-content/site-header/admin classes; reader dimensions and user-selected reading preferences remain independent.
- Keep novels on the shared work details route, but give them a dedicated text reader while manga/comics retain the image reader, so both formats share catalog data without compromising reading ergonomics.
- Bun regression tests live in tests/ outside the application compiler inputs so test-runner globals do not change the hosted runtime's DOM types.
- cPanel uses CPANEL_BUILD=1 and Nitro node-server; app.cjs validates output/config via scripts/cpanel-runtime.cjs and honors Passenger ports without changing hosted builds.
- Session state is provided once by SessionProvider in the root; useSession consumes it so repeated catalog cards do not create individual auth subscriptions.
- Global click audio uses one client-only player and delegated document listener mounted in the root, so navigation preserves playback without per-control subscriptions.
- The shared header uses CSS sticky positioning without scroll-driven React state; the hero pauses its timer outside the viewport to avoid unnecessary work during scrolling.
- Work requests and availability notifications are user-scoped tables; database triggers fulfill exact title/type matches on publication and an admin-only RPC resolves other matches atomically, so imports and manual publications share one notification path.
- Share work categories and age-rating display through browser-safe modules and one badge component, so filters, cards, details, shelves and the panel stay consistent.

- Genre selectors, import writes and public genre labels use the browser-safe work-genres module; alias-aware catalog filtering preserves old records without bulk rewrites.
- Homepage discovery shelves use admin-only persisted selection settings and lightweight published-work queries; automatic ordering uses saved AniList metrics so home visits never call AniList, while manual selection preserves its order without fallback.
- Recent updates uses the shared horizontal shelf and browser-safe selection helper for both query and display limits, keeping layout and result counts consistent.
- List queries use aggregate chapter totals and aliased bounded previews; details cache full indexes separately from reader content to avoid oversized downloads.

- Use RLS reads and server APK signing; minimum-only edits preserve files and publication.
- Follow docs/MIGRATIONS.md; never auto-run unjournaled SQL containing pending changes.

- Classification uses admin RLS/CAS approval, independently delivered parallel groups and paged review rendering. AI streams with lease/pause; manual AniList search loads on selection and requires identity choice, no AI credits or inferred age.

- DB title claims guard writes; duplicate scans mirror normalization, paginate published works and confirm individual RLS deletes.
- Account sub-profiles: the main profile is an implicit sentinel UUID (`MAIN_PROFILE_ID`), extra profiles live in `account_profiles`; reading_history/favorites are keyed by profile_id, and the active profile is a client store (`src/lib/active-profile.ts`) read by query helpers so existing rows stay on the main profile without backfill.

- Discovery/collection reuse LibraryBits and URL filters; tools mount on expansion. AdminShell owns studio navigation, independent of public headers/readers.
- Reels: private bucket, owner folders, admin review, signed URLs; hidden for kids.
- MediocreScan: admin and public createServerFn proxies share one allowlisted server helper (fixed GET paths, CDN content path only from API chapter metadata, token only in MEDIOCRE_API_TOKEN); /mediocre is the public showcase. Imports copy works into series (source_mediocre_id unique) in bounded chapter batches; reader requests auto-import only a single exact title match, found via /obras/buscar?string= with the public lists as fallback.
- MediocreScan queue counts skipped chapters as bounded work failures and only inserted chapters reduce remaining; IP blocks retain cooldown without consuming attempts, so unavailable content cannot stall following works or falsely complete an import.
