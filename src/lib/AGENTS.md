# src/lib rules

- Novel narration uses Lovable AI TTS via the signed-in /api/tts route with device speech as fallback, because AI voices sound natural while fallback keeps reading working.
- Remote novel imports enforce an exact server host allowlist, deadline and byte budget; revalidate every redirect.
- Maintenance uses singleton settings and restrictive RLS; request middleware gates documents/API, function middleware gates RPCs where metadata is available. Verified admin bearer sessions bridge refresh via a short-lived HTTP-only cookie, never client roles. Media uses a private bucket and renewable signed URLs.
- Browser maintenance status uses a public HTTP projection, SSR a server function; failed checks fail closed to avoid blank notices or bypasses.
- Maintenance backgrounds use lazy-loaded TUS uploads in 6 MiB chunks with session refresh, retries and real progress; storage validation accepts preflight contentLength or legacy null metadata and completed size, while admin-only policies and bucket limits remain mandatory so resumable authorization does not reject valid uploads.
- Maintenance video audio uses a shared playback helper with muted fallback, interaction retry and visibility resume; preview listeners stay scoped so browser autoplay restrictions do not stop the video.
- Novel illustrations use validated standalone image markers in chapters.content and a browser-safe shared HTML parser; reader and preview consume ordered blocks, and narration receives empty image entries to preserve paragraph indexes without speaking URLs.
- TXT/JSON chapter imports validate CDN links in browser-safe parsers and write sequentially with RLS, never storing originals or capturing external sessions; share filename numbering.
- Novel file imports use a browser-safe text parser and sequential authenticated chapter writes with an explicit review step; original TXT/HTML files never enter Storage, preserving illustrations without retaining source files.
- MediocreScan token: admin-saved token in service-role-only mediocre_settings overrides the env secret; successful API answers are kept in mediocre_cache and served when the live call fails, so token expiry does not blank the showcase.
