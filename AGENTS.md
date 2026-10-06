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
- `npm run build:cpanel` (CPANEL_BUILD=1) switches nitro to the node-server preset with app.cjs as Passenger entry; Lovable builds ignore it so publishing stays on its own target.
