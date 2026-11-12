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

- SDR API key unit authorization is centralized in server scope guards before idempotency replay, with filtered reads and pre-limit scoped follow-ups; empty api_key_units mappings preserve legacy access, so linked protocols and existing conversations must also be checked.
- Admin unit visibility remains enforced by existing can_access_unit/can_manage_unit RLS; SAC assignment cannot bypass unit access, CRM contact reads require an authorized conversation, and organization-wide holidays are shared read-only except for super admins.

- Keep mobile admin navigation in a visible grid and constrain the shared content column with min-width zero; wide data belongs in local scrollers or mobile item lists to prevent page-level overflow.

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
- Services per unit (migration 007): `units.services` lists what each unit offers (Goiânia: almoço no quilo + rodízio de pizza; Anápolis: churrasco, executivo, quilo, pizza). The trigger `reservations_service_guard` rejects a reservation whose service the unit does not offer (`SERVICE_NOT_OFFERED`), and `/reservar` only lists units that offer the chosen rodízio. Prices live in `price_tables`/`price_rules` (editable in Painel > Valores) and are resolved by `resolve_unit_prices`; the WhatsApp attendant must never quote a price that did not come from `/prices` or `/context`.
- WhatsApp attendant (n8n, see `docs/ATENDENTE_WHATSAPP.md` and `n8n/*.workflow.ts`): it only calls the SDR API; prices/hours/availability must come from `/prices`, `/context`, `/availability` — never hardcode them in prompts. Config lives in the n8n data table `candeeiro_config` (kill switch `ativo`, `modo_teste` + `numeros_teste` whitelist). When the API contract changes, update the tool executor in the n8n sub-workflow `rodada-ia` and the tool list in the main workflow's "Montar prompt" node.
- One-tap approval defers the `set_reservation_status` call until the undo window ends (`src/lib/approvals.ts`), because the DB sends WhatsApp on confirm and confirmed reservations cannot go back to pending.
