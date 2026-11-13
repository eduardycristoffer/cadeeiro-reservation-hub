-- 015 — Alertas no painel (sino) e por e-mail
-- Quando acontece algo que a equipe precisa ver (reserva nova, grupo grande, cancelamento do cliente, SAC, lead do
-- WhatsApp, mensagem que não saiu), o banco grava um alerta e, se o e-mail estiver ligado, enfileira um e-mail por
-- pessoa que deve receber. Quem envia é o servidor do app (Resend), chamado pelo n8n a cada minuto.
-- Os gatilhos NUNCA atrapalham a reserva: qualquer erro aqui é engolido.

-- 1) Configuração (uma por organização) ---------------------------------------------------------------------------
create table if not exists public.notification_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  email_enabled boolean not null default true,
  email_kinds jsonb not null default '{}'::jsonb,
  extra_emails text[] not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (cardinality(extra_emails) <= 10)
);

-- 2) Alertas, leitura e preferência pessoal ------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  kind text not null check (kind in ('reserva_pendente','grupo_grande','reserva_cancelada','sac_novo','lead_whatsapp','falha_envio')),
  severity text not null default 'info' check (severity in ('info','atencao','urgente')),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 600),
  link text check (link is null or link ~ '^/admin(/[a-z0-9-]+)?$'),
  entity_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists notifications_entity_idx on public.notifications (kind, entity_id) where entity_id is not null;
create index if not exists notifications_recent_idx on public.notifications (organization_id, created_at desc);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 3) Fila de e-mails (só o servidor lê e escreve) -------------------------------------------------------------------
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('alerta','teste')),
  notification_id uuid references public.notifications(id) on delete set null,
  to_email text not null check (char_length(to_email) <= 254 and to_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  subject text not null check (char_length(subject) between 1 and 200),
  body_text text not null check (char_length(body_text) <= 2000),
  link_path text check (link_path is null or link_path ~ '^/admin(/[a-z0-9-]+)?$'),
  status text not null default 'pendente' check (status in ('pendente','enviando','enviado','falhou','cancelado')),
  attempts integer not null default 0,
  last_error text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists email_outbox_dedupe_idx on public.email_outbox (dedupe_key);
create index if not exists email_outbox_queue_idx on public.email_outbox (status, scheduled_for);

do $$ declare t text; begin
  foreach t in array array['notification_settings','notifications','notification_reads','notification_prefs','email_outbox'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
grant select on public.notifications, public.notification_reads, public.notification_prefs to authenticated;
grant insert on public.notification_reads to authenticated;

drop policy if exists "staff lê alertas da unidade" on public.notifications;
create policy "staff lê alertas da unidade" on public.notifications for select to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin')
    or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)
        and (kind not in ('grupo_grande','falha_envio') or public.has_role(auth.uid(), 'gestor')))
    or (unit_id is null and public.has_role(auth.uid(), 'gestor'))
  );
drop policy if exists "lê próprias leituras" on public.notification_reads;
create policy "lê próprias leituras" on public.notification_reads for select to authenticated using (user_id = auth.uid());
drop policy if exists "marca própria leitura" on public.notification_reads;
create policy "marca própria leitura" on public.notification_reads for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "lê própria preferência" on public.notification_prefs;
create policy "lê própria preferência" on public.notification_prefs for select to authenticated using (user_id = auth.uid());

drop trigger if exists email_outbox_updated_at on public.email_outbox;
create trigger email_outbox_updated_at before update on public.email_outbox for each row execute function public.set_updated_at();

-- 4) Regras de quem recebe -----------------------------------------------------------------------------------------
create or replace function public._notif_kinds() returns text[] language sql immutable as $$
  select array['reserva_pendente','grupo_grande','reserva_cancelada','sac_novo','lead_whatsapp','falha_envio']
$$;
-- e-mail ligado por padrão em tudo, menos lead do WhatsApp (muito frequente; continua no sino)
create or replace function public._notif_email_default(_kind text) returns boolean language sql immutable as $$
  select _kind <> 'lead_whatsapp'
$$;
revoke all on function public._notif_kinds() from public, anon, authenticated;
revoke all on function public._notif_email_default(text) from public, anon, authenticated;

-- Funcionário recebe reserva/cancelamento/SAC/lead da própria unidade; grupo grande e falha de envio vão só para gestor.
-- Super admin recebe tudo. Sem unidade: só gestor/super admin. Quem desligou o e-mail no perfil não recebe.
create or replace function public._notif_recipients(_org uuid, _kind text, _unit uuid)
returns table (email text) language sql stable security definer set search_path = public as $$
  select distinct lower(btrim(u.email))
    from auth.users u
    join public.user_profiles p on p.id = u.id and p.is_active and coalesce(p.organization_id, _org) = _org
   where u.email is not null and btrim(u.email) <> ''
     and (u.banned_until is null or u.banned_until < now())
     and coalesce((select np.email_alerts from public.notification_prefs np where np.user_id = u.id), true)
     and (
       exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'super_admin')
       or (_unit is not null
           and exists (select 1 from public.user_unit_access a where a.user_id = u.id and a.unit_id = _unit)
           and exists (select 1 from public.user_roles r where r.user_id = u.id
                        and (r.role = 'gestor' or (r.role = 'funcionario' and _kind not in ('grupo_grande','falha_envio')))))
       or (_unit is null and exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'gestor'))
     )
$$;
revoke all on function public._notif_recipients(uuid,text,uuid) from public, anon, authenticated;

-- 5) Criar alerta (+ e-mails) ---------------------------------------------------------------------------------------
create or replace function public._notify(_kind text, _unit uuid, _severity text, _title text, _body text, _link text, _entity uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid; n uuid; cfg public.notification_settings; want boolean; r record;
begin
  select un.organization_id into v_org from public.units un where un.id = _unit;
  v_org := coalesce(v_org, public._default_org());
  insert into public.notifications (organization_id, unit_id, kind, severity, title, body, link, entity_id)
  values (v_org, _unit, _kind, _severity, left(_title, 160), left(_body, 600), _link, _entity)
  on conflict (kind, entity_id) where entity_id is not null do nothing
  returning id into n;
  if n is null then return null; end if;

  begin  -- falha no e-mail não derruba o alerta do sino
    select * into cfg from public.notification_settings s where s.organization_id = v_org;
    want := coalesce(cfg.email_enabled, true)
            and coalesce((cfg.email_kinds ->> _kind)::boolean, public._notif_email_default(_kind));
    if want then
      for r in select e.email from public._notif_recipients(v_org, _kind, _unit) e
               union select lower(btrim(x)) from unnest(coalesce(cfg.extra_emails, '{}')) x loop
        insert into public.email_outbox (organization_id, kind, notification_id, to_email, subject, body_text, link_path, dedupe_key)
        values (v_org, 'alerta', n, r.email, left('[Candeeiro] ' || _title, 200),
                left(coalesce(_body, ''), 1500), _link, n::text || ':' || r.email)
        on conflict (dedupe_key) do nothing;
      end loop;
    end if;
  exception when others then null;
  end;
  return n;
exception when others then
  return null;
end $$;
revoke all on function public._notify(text,uuid,text,text,text,text,uuid) from public, anon, authenticated;

-- 6) Gatilhos (cada um engole qualquer erro) --------------------------------------------------------------------------
-- Reserva nova vinda do site ou do WhatsApp (quem cria pelo painel já sabe, então não gera alerta).
create or replace function public.trg_notify_reservation_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare un text; cn text;
begin
  if auth.uid() is not null or new.status <> 'pendente' then return new; end if;
  begin
    select name into un from public.units where id = new.unit_id;
    select initcap(split_part(btrim(c.full_name), ' ', 1)) into cn from public.customers c where c.id = new.customer_id;
    perform public._notify(
      case when new.is_large_group then 'grupo_grande' else 'reserva_pendente' end, new.unit_id,
      case when new.is_large_group then 'atencao' else 'info' end,
      case when new.is_large_group then 'Grupo grande para aprovar' else 'Nova reserva para aprovar' end,
      concat_ws(' · ', cn, new.party_size::text || ' pessoas', to_char(new.reservation_date, 'DD/MM') || ' às ' || to_char(new.reservation_time, 'HH24:MI'), un),
      '/admin/aprovacoes', new.id);
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.trg_notify_reservation_new() from public, anon, authenticated;
drop trigger if exists zz_notify_reservation_new on public.reservations;
create trigger zz_notify_reservation_new after insert on public.reservations for each row execute function public.trg_notify_reservation_new();

-- Cancelamento pelo cliente (WhatsApp/SDR): quem cancela logado no painel já sabe.
create or replace function public.trg_notify_reservation_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare un text; cn text; why text; today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is not null then return new; end if;
  begin
    select name into un from public.units where id = new.unit_id;
    select initcap(split_part(btrim(c.full_name), ' ', 1)) into cn from public.customers c where c.id = new.customer_id;
    why := nullif(btrim(regexp_replace(coalesce(current_setting('app.status_note', true), ''), '^Cancelada pelo cliente via WhatsApp:\s*', '')), '');
    perform public._notify('reserva_cancelada', new.unit_id,
      case when new.reservation_date <= today + 1 then 'atencao' else 'info' end,
      'Reserva cancelada pelo cliente',
      concat_ws(' · ', cn, new.party_size::text || ' pessoas', to_char(new.reservation_date, 'DD/MM') || ' às ' || to_char(new.reservation_time, 'HH24:MI'), un,
                case when why is not null then 'Motivo: ' || left(why, 200) end),
      '/admin/reservas', new.id);
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.trg_notify_reservation_cancel() from public, anon, authenticated;
drop trigger if exists zz_notify_reservation_cancel on public.reservations;
create trigger zz_notify_reservation_cancel after update of status on public.reservations for each row
  when (new.status = 'cancelada' and old.status in ('pendente','confirmada')) execute function public.trg_notify_reservation_cancel();

create or replace function public.trg_notify_sac_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then return new; end if;
  begin
    perform public._notify('sac_novo', new.unit_id,
      case when new.priority = 'urgente' then 'urgente' when new.priority = 'alta' or new.human_requested then 'atencao' else 'info' end,
      case when new.human_requested then 'Cliente pediu um atendente' else 'Novo atendimento no SAC' end,
      concat_ws(' · ', new.category::text, left(new.subject, 120), 'prioridade ' || new.priority::text), '/admin/sac', new.id);
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.trg_notify_sac_new() from public, anon, authenticated;
drop trigger if exists zz_notify_sac_new on public.sac_tickets;
create trigger zz_notify_sac_new after insert on public.sac_tickets for each row execute function public.trg_notify_sac_new();

create or replace function public.trg_notify_lead_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._notify('lead_whatsapp', new.unit_id, 'info', 'Novo lead no WhatsApp',
      concat_ws(' · ', initcap(split_part(btrim(new.full_name), ' ', 1)), initcap(new.city), new.campaign), '/admin/leads', new.id);
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.trg_notify_lead_new() from public, anon, authenticated;
drop trigger if exists zz_notify_lead_new on public.whatsapp_leads;
create trigger zz_notify_lead_new after insert on public.whatsapp_leads for each row execute function public.trg_notify_lead_new();

-- Mensagem de confirmação/cancelamento que desistiu de tentar
create or replace function public.trg_notify_outbox_failed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_unit uuid; v_proto text;
begin
  begin
    select r.unit_id, r.protocol into v_unit, v_proto from public.reservations r where r.id = new.reservation_id;
    perform public._notify('falha_envio', v_unit, 'urgente', 'Mensagem ao cliente não foi enviada',
      concat_ws(' · ', case when v_proto is not null then 'Reserva ' || v_proto end, left(coalesce(new.error, 'erro no envio'), 150)),
      '/admin/reservas', new.id);
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.trg_notify_outbox_failed() from public, anon, authenticated;
drop trigger if exists zz_notify_outbox_failed on public.message_outbox;
create trigger zz_notify_outbox_failed after update of status on public.message_outbox for each row
  when (new.status = 'falhou' and old.status is distinct from 'falhou') execute function public.trg_notify_outbox_failed();

-- Mensagem de CRM (follow-up, reaver, remarketing) que falhou de vez
create or replace function public.trg_notify_crm_send_failed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._notify('falha_envio', new.unit_id, 'atencao', 'Mensagem de CRM não foi enviada',
      concat_ws(' · ', initcap(coalesce(new.first_name, 'Cliente')), left(coalesce(new.last_error, 'erro no envio'), 150)), '/admin/crm', new.id);
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public.trg_notify_crm_send_failed() from public, anon, authenticated;
drop trigger if exists zz_notify_crm_send_failed on public.crm_sends;
create trigger zz_notify_crm_send_failed after update of status on public.crm_sends for each row
  when (new.status = 'falhou' and old.status is distinct from 'falhou') execute function public.trg_notify_crm_send_failed();

-- 7) Painel: sino e preferências pessoais ----------------------------------------------------------------------------
create or replace function public.notifications_unread_count() returns integer
language sql stable security invoker set search_path = public as $$
  select count(*)::integer from public.notifications n
   where n.created_at > now() - interval '14 days'
     and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = auth.uid())
$$;
revoke all on function public.notifications_unread_count() from public, anon;
grant execute on function public.notifications_unread_count() to authenticated;

-- _ids nulo = marcar tudo que a pessoa pode ver. Invoker: a RLS de alertas decide o que existe para ela.
create or replace function public.notifications_mark_read(_ids uuid[] default null) returns integer
language plpgsql volatile security invoker set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  insert into public.notification_reads (notification_id, user_id)
  select x.id, auth.uid() from public.notifications x
   where (_ids is null or x.id = any(_ids)) and x.created_at > now() - interval '14 days'
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.notifications_mark_read(uuid[]) from public, anon;
grant execute on function public.notifications_mark_read(uuid[]) to authenticated;

create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('email_alerts', coalesce((select p.email_alerts from public.notification_prefs p where p.user_id = auth.uid()), true))
   where auth.uid() is not null
$$;
revoke all on function public.notification_prefs_get() from public, anon;
grant execute on function public.notification_prefs_get() to authenticated;

create or replace function public.notification_prefs_set(_email_alerts boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  insert into public.notification_prefs as p (user_id, email_alerts) values (auth.uid(), coalesce(_email_alerts, true))
  on conflict (user_id) do update set email_alerts = excluded.email_alerts, updated_at = now();
end $$;
revoke all on function public.notification_prefs_set(boolean) from public, anon;
grant execute on function public.notification_prefs_set(boolean) to authenticated;

-- 8) Painel: configuração de e-mail (gestor) ------------------------------------------------------------------------
create or replace function public.notification_settings_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); cfg public.notification_settings; k text; kinds jsonb := '{}'::jsonb;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into cfg from public.notification_settings s where s.organization_id = v_org;
  foreach k in array public._notif_kinds() loop
    kinds := kinds || jsonb_build_object(k, coalesce((cfg.email_kinds ->> k)::boolean, public._notif_email_default(k)));
  end loop;
  return jsonb_build_object(
    'email_enabled', coalesce(cfg.email_enabled, true), 'email_kinds', kinds, 'extra_emails', to_jsonb(coalesce(cfg.extra_emails, '{}')),
    'queue', jsonb_build_object(
      'pending', (select count(*) from public.email_outbox o where o.organization_id = v_org and o.status in ('pendente','enviando')),
      'sent_7d', (select count(*) from public.email_outbox o where o.organization_id = v_org and o.status = 'enviado' and o.sent_at > now() - interval '7 days'),
      'failed_7d', (select count(*) from public.email_outbox o where o.organization_id = v_org and o.status = 'falhou' and o.created_at > now() - interval '7 days'),
      'last_error', (select o.last_error from public.email_outbox o where o.organization_id = v_org and o.last_error is not null order by o.updated_at desc limit 1)));
end $$;
revoke all on function public.notification_settings_get() from public, anon;
grant execute on function public.notification_settings_get() to authenticated;

create or replace function public.notification_settings_save(_cfg jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); cur public.notification_settings; kinds jsonb; k text; v jsonb; extra text[] := '{}'; e text; en boolean;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _cfg is null or jsonb_typeof(_cfg) <> 'object' then raise exception 'INVALID_SETTINGS'; end if;
  select * into cur from public.notification_settings s where s.organization_id = v_org;
  en := coalesce((_cfg ->> 'email_enabled')::boolean, cur.email_enabled, true);
  kinds := coalesce(cur.email_kinds, '{}'::jsonb);
  if _cfg ? 'email_kinds' then
    if jsonb_typeof(_cfg -> 'email_kinds') <> 'object' then raise exception 'INVALID_SETTINGS'; end if;
    for k, v in select * from jsonb_each(_cfg -> 'email_kinds') loop
      if not (k = any(public._notif_kinds())) or jsonb_typeof(v) <> 'boolean' then raise exception 'INVALID_SETTINGS'; end if;
      kinds := kinds || jsonb_build_object(k, v);
    end loop;
  end if;
  if _cfg ? 'extra_emails' then
    if jsonb_typeof(_cfg -> 'extra_emails') <> 'array' then raise exception 'INVALID_SETTINGS'; end if;
    for e in select jsonb_array_elements_text(_cfg -> 'extra_emails') loop
      e := lower(btrim(e));
      if char_length(e) > 254 or e !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_EMAIL'; end if;
      if not (e = any(extra)) then extra := extra || e; end if;
    end loop;
    if cardinality(extra) > 10 then raise exception 'INVALID_SETTINGS'; end if;
  else
    extra := coalesce(cur.extra_emails, '{}');
  end if;
  insert into public.notification_settings as s (organization_id, email_enabled, email_kinds, extra_emails, updated_by)
  values (v_org, en, kinds, extra, auth.uid())
  on conflict (organization_id) do update set email_enabled = excluded.email_enabled, email_kinds = excluded.email_kinds,
    extra_emails = excluded.extra_emails, updated_by = excluded.updated_by, updated_at = now();
  perform public.write_audit('painel', 'alertas.config_salva', 'notification_settings', null, null, null,
    jsonb_build_object('email_enabled', en, 'email_kinds', kinds, 'extras', cardinality(extra)), null);
exception when invalid_text_representation then
  raise exception 'INVALID_SETTINGS';
end $$;
revoke all on function public.notification_settings_save(jsonb) from public, anon;
grant execute on function public.notification_settings_save(jsonb) to authenticated;

-- E-mail de teste para o próprio gestor (confirma que o envio está funcionando)
create or replace function public.email_test_enqueue() returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_mail text;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select lower(btrim(u.email)) into v_mail from auth.users u where u.id = auth.uid();
  if v_mail is null or v_mail = '' then raise exception 'INVALID_EMAIL'; end if;
  if (select count(*) from public.email_outbox o where o.kind = 'teste' and o.to_email = v_mail and o.created_at > now() - interval '1 minute') >= 3 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.email_outbox (organization_id, kind, to_email, subject, body_text, link_path, dedupe_key)
  values (v_org, 'teste', v_mail, '[Candeeiro] E-mail de teste', 'Se você recebeu esta mensagem, os alertas por e-mail do painel Candeeiro estão funcionando.', '/admin/alertas',
          'teste:' || gen_random_uuid()::text);
end $$;
revoke all on function public.email_test_enqueue() from public, anon;
grant execute on function public.email_test_enqueue() to authenticated;

-- 9) Fila para o servidor do app ---------------------------------------------------------------------------------------
create or replace function public.sdr_email_claim(_limit integer default 20) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  -- limpeza leve (sem cron): e-mails já resolvidos há 30 dias e alertas com 90 dias
  delete from public.email_outbox where status in ('enviado','cancelado') and updated_at < now() - interval '30 days';
  delete from public.notifications where created_at < now() - interval '90 days';

  update public.email_outbox set status = case when attempts >= 4 then 'falhou' else 'pendente' end,
         last_error = coalesce(last_error, 'sem retorno do envio'), scheduled_for = now() + interval '5 minutes'
   where status = 'enviando' and updated_at < now() - interval '10 minutes';

  with picked as (
    select o.id from public.email_outbox o
     where o.status = 'pendente' and o.scheduled_for <= now() and o.attempts < 4
     order by o.scheduled_for, o.created_at limit least(greatest(1, coalesce(_limit, 20)), 50) for update skip locked
  ), upd as (
    update public.email_outbox o set status = 'enviando', attempts = o.attempts + 1 from picked where o.id = picked.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'to', u.to_email, 'subject', u.subject, 'text', u.body_text,
           'link_path', u.link_path, 'kind', u.kind) order by u.created_at), '[]'::jsonb)
    into out from upd u;
  return out;
end $$;
revoke all on function public.sdr_email_claim(integer) from public, anon, authenticated;
grant execute on function public.sdr_email_claim(integer) to service_role;

create or replace function public.sdr_email_mark(_id uuid, _ok boolean, _error text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.email_outbox x
     set status = case when _ok then 'enviado' when x.attempts >= 4 then 'falhou' else 'pendente' end,
         sent_at = case when _ok then now() else x.sent_at end,
         last_error = case when _ok then null else left(coalesce(_error, 'erro'), 300) end,
         scheduled_for = case when _ok or x.attempts >= 4 then x.scheduled_for else now() + (x.attempts * interval '3 minutes') end
   where x.id = _id and x.status = 'enviando';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.sdr_email_mark(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.sdr_email_mark(uuid,boolean,text) to service_role;
