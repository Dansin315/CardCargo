# CardCargo Bunjang Import Unified Patch v3

This combined patch includes all files needed for the Bunjang API-first import:

- `lib/importer/bunjang-api.ts`
- `lib/importer/render-bunjang.ts`
- updated `lib/importer/parse-listing.ts`
- updated preview route and Next.js config
- tests

The API path is attempted first. Static HTML and Playwright remain fallbacks.
