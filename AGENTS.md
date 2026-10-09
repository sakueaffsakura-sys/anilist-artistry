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

- Public SEO metadata for database-backed pages must come from route loaders so the initial HTML is content-specific and shareable.
- The sitemap includes only public static pages, published works, and public community lists; private and authenticated areas stay excluded.
- Keep work rankings at `/ranking` and reader XP rankings at `/ranking-leitores` so each audience has a focused page.
- Use Sora for headings and Manrope for body text; the profile follows a dark cyan bento layout so dense achievements stay contained and scannable.
- Keep novels on the shared work details route, but give them a dedicated text reader while manga/comics retain the image reader, so both formats share catalog data without compromising reading ergonomics.
- Novel narration uses Lovable AI TTS via the signed-in /api/tts route with device speech as fallback, because AI voices sound natural while fallback keeps reading working.
- Remote novel imports use an exact server-configured host allowlist and a server-only streaming fetch helper with a total deadline and byte budget; manual redirects revalidate every destination because hostname filtering alone cannot safely verify DNS in the hosted runtime.
- Bun regression tests live in tests/ outside the application compiler inputs so test-runner globals do not change the hosted runtime's DOM types.
- Maintenance is persisted in a singleton settings row, enforced by restrictive content RLS and request middleware; verified admin bearer sessions bridge hard refresh via an HTTP-only short-lived cookie, never a client role flag. Maintenance media stays in its own private bucket and uses renewable signed URLs.
- Maintenance backgrounds use lazy-loaded TUS uploads in 6 MiB chunks with session refresh, retries and real progress; storage validation accepts preflight contentLength or legacy null metadata and completed size, while admin-only policies and bucket limits remain mandatory so resumable authorization does not reject valid uploads before transfer.
- The cross-platform cPanel build launcher sets CPANEL_BUILD=1 for Nitro node-server outside Lovable; app.cjs validates the Node output and server configuration using scripts/cpanel-runtime.cjs and respects Passenger's port, keeping the hosted target unchanged.
- Session state is provided once by SessionProvider in the root; useSession consumes that shared state so repeated catalog cards do not create individual auth subscriptions.
- Global click audio uses one client-only player and delegated document listener mounted in the root, so navigation preserves playback without per-control subscriptions.
- The shared header uses CSS sticky positioning without scroll-driven React state; the hero pauses its timer outside the viewport to avoid unnecessary work during scrolling.
- Work requests and availability notifications are user-scoped tables; database triggers fulfill exact title/type matches on publication and an admin-only RPC resolves other matches atomically, so imports and manual publications share one notification path.
- Work category options and AniList classification live in a browser-safe shared module so catalog filters, administration and requests use consistent values without importing database clients into classification tests.

- Novel illustrations use validated standalone image markers in chapters.content and a browser-safe shared HTML parser; reader and preview consume ordered blocks, and narration receives empty image entries to preserve paragraph indexes without speaking URLs.
- Work TXT imports use a browser-safe page-link parser and sequential chapter writes through the existing authenticated client, never Storage uploads; this avoids retaining source files or loading an unbounded batch into memory.

- Genre selectors, import writes and public genre labels use the browser-safe work-genres module; alias-aware catalog filtering preserves old records without bulk rewrites.
- Homepage discovery shelves use admin-only persisted selection settings and lightweight published-work queries; automatic ordering uses saved AniList metrics so home visits never call AniList, while manual selection preserves its order without fallback.
