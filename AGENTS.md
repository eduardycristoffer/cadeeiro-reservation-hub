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
- Staff never writes `reservations` directly (INSERT/UPDATE revoked from authenticated): status changes, arrival, notes and manual bookings go through SECURITY DEFINER RPCs (`set_reservation_status`, `mark_reservation_arrived`, `add_reservation_note`, `create_staff_reservation`) so transitions, capacity locks and history stay enforced in the database.
- `has_role`/`is_staff` require an active `user_profiles` row, so deactivating a user cuts access in RLS, not just the UI.
- External callers (SDR on n8n, Tryade CRM/Chatwoot webhook, cron worker) hit `src/routes/api/public/*`; route files only dynamic-import `src/server/*.server.ts`, which use the service-role client and service-role-only RPCs (`sdr_*`, `crm_*`). Pure, tested logic (phone, event ids, HMAC, idempotency, suggested messages, CRM label mapping) lives in `src/lib/integration/` so it runs in workerd and in tests.
- CRM credentials live only in server secrets (`TRYADE_CRM_API_TOKEN`, optional `TRYADE_CRM_WEBHOOK_HMAC_SECRET`); the DB stores only hashes (API keys, webhook token). Outbound CRM events are enqueued by DB triggers/RPCs into `crm_events` and stay pending while the integration is unconfigured.
- Hardening (migration 004): `user_profiles_guard` blocks self-service changes to `is_active`/`organization_id`; `reservation_status_history` has no INSERT policy or grant (written only by triggers/RPCs); `has_role`/`is_staff`/`can_*_unit` are not executable by `anon`; `anon` has no table privileges. `run_data_retention()` is the LGPD purge (pg_cron, daily); `anonymize_inactive_customers()` is manual-only. New tables must grant only what they need — never rely on Supabase default grants.
- Reservation flow (migration 005): the contact (name + phone + privacy consent) is captured first via `capture_reservation_lead` (anon RPC, stored in `reservation_leads`, super admin read-only); `create_public_reservation` takes `_service` (`rodizio_carnes`|`rodizio_pizza`), `_occasion`, `_celebrant_name`, `_campaign` and marks the lead converted. Campaign links are `/reservar?rodizio=carnes|pizza&campanha=<slug>`; URL search validators must be idempotent (the router re-validates normalized values). With supabase-js, an RPC builder only fires when awaited or `.then`'d — never `void` it.
- Migration tool limits (Lovable): no data UPDATE/INSERT and no `cron.*` in migrations; put those in `db/maintenance/` and run them directly.
