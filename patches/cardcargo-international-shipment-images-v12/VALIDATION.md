# Validation

Completed in the artifact environment:

- TypeScript/TSX syntax transpilation for all changed files.
- Shell syntax validation for `apply.sh`.
- Internal import and file-presence checks.
- Migration structure review.
- Patch application test against the reconstructed CardCargo v11 project.
- ZIP integrity check.

Not completed in the artifact environment:

- Full `npm install`, typecheck, lint, Vitest and Next.js build, because the npm registry was unavailable (`EAI_AGAIN`).
- Live Supabase migration and storage integration test.

Run the commands in README.md locally after applying the patch.
