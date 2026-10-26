create or replace function public.guard_user_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN';
  end if;
  if (new.is_active is distinct from old.is_active
      or new.organization_id is distinct from old.organization_id)
     and not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end $$;

drop trigger if exists user_profiles_guard on public.user_profiles;
create trigger user_profiles_guard before update on public.user_profiles
for each row execute function public.guard_user_profile_update();

drop policy if exists "staff registra observação" on public.reservation_status_history;
revoke insert, update, delete, truncate on public.reservation_status_history from anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.has_role(uuid,public.app_role)',
    'public.is_staff(uuid)',
    'public.can_access_unit(uuid,uuid)',
    'public.can_manage_unit(uuid,uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on public.api_keys, public.api_idempotency, public.public_rate_limits from anon, authenticated;

create or replace function public.run_data_retention()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n_logs int; n_events int; n_outbox int; n_audit int; n_idem int;
begin
  delete from public.integration_event_logs where created_at < now() - interval '90 days';
  get diagnostics n_logs = row_count;

  delete from public.crm_events
   where status in ('enviado','entregue','lido','cancelado','falhou')
     and created_at < now() - interval '90 days';
  get diagnostics n_events = row_count;

  delete from public.message_outbox
   where status in ('enviado','entregue','lido','cancelado','falhou')
     and created_at < now() - interval '180 days';
  get diagnostics n_outbox = row_count;

  delete from public.audit_logs where created_at < now() - interval '365 days';
  get diagnostics n_audit = row_count;

  delete from public.api_idempotency where expires_at < now();
  get diagnostics n_idem = row_count;

  return jsonb_build_object('integration_event_logs', n_logs, 'crm_events', n_events,
    'message_outbox', n_outbox, 'audit_logs', n_audit, 'api_idempotency', n_idem);
end $$;

create or replace function public.anonymize_inactive_customers(_months integer)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if _months is null or _months < 12 then raise exception 'VALIDATION_ERROR'; end if;
  with stale as (
    select c.id from public.customers c
     where c.full_name <> 'Cliente anonimizado'
       and c.updated_at < now() - make_interval(months => _months)
       and not exists (select 1 from public.reservations r
                        where r.customer_id = c.id
                          and (r.status in ('pendente','confirmada')
                               or r.reservation_date >= (now() - make_interval(months => _months))::date))
       and not exists (select 1 from public.sac_tickets s
                        where s.customer_id = c.id and s.status in ('aberto','em_andamento','aguardando_cliente'))
  ), up as (
    update public.customers c
       set full_name = 'Cliente anonimizado', phone_e164 = 'anon:' || c.id::text, email = null,
           notes = null, whatsapp_opt_in = false
      from stale where c.id = stale.id
    returning c.id
  ), contacts as (
    update public.crm_contacts k
       set phone_e164 = null, display_name = null, raw = null
     where k.customer_id in (select id from up)
    returning 1
  ), res as (
    update public.reservations r set notes = null
     where r.customer_id in (select id from up) and r.notes is not null
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;

revoke all on function public.run_data_retention() from public, anon, authenticated;
revoke all on function public.anonymize_inactive_customers(integer) from public, anon, authenticated;
grant execute on function public.run_data_retention() to service_role;
grant execute on function public.anonymize_inactive_customers(integer) to service_role;