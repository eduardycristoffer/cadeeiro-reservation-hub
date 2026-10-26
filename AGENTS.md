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

# Project rules

- Backend is Lovable Cloud (enabled by the owner on 2026-10-26, reversing the earlier "own Supabase" plan); `db/migrations/` keeps the canonical SQL and every change is applied through the migration tool, so the file and the live schema must stay in sync.
- Public visitors never touch tables directly: the reservation page only calls SECURITY DEFINER RPCs (`public_list_units`, `get_unit_slots`, `get_unit_available_dates`, `create_public_reservation`), so availability is revalidated server-side under an advisory lock.
- Roles live in `user_roles`; unit isolation via `can_access_unit` / `can_manage_unit` in every RLS policy — never check permissions only in the UI.
- `src/lib/supabase.ts` returns `null` when env is missing; every screen must render a "not connected" state instead of crashing.
- Credentials never go in tables; `integration_settings.secret_name` stores only the secret's name.
