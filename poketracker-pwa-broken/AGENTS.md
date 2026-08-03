<!-- BEGIN:nextjs-agent-rules -->
# Next.js: read version-matched docs before coding
Before changing Next.js code, read the relevant documentation bundled in `node_modules/next/dist/docs/`.
<!-- END:nextjs-agent-rules -->

Project rules:
- Keep Supabase secret keys server-only.
- Keep listing images in the private `listing-images` bucket.
- Preserve SSRF protections in `lib/importer/safe-fetch.ts`.
- The application is single-user; do not add public sign-up flows.
