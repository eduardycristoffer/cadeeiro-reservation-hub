-- 020 — App instalado no celular e alertas no popup (push)
-- Cada pessoa liga os alertas por aparelho (celular, tablet, computador). Quando o banco cria um alerta (016), ele
-- também enfileira um aviso de popup para quem deve receber e tem aparelho ligado. Quem envia é o servidor do app,
-- na mesma rodada de 1 minuto dos e-mails. As regras de quem recebe são as mesmas do e-mail: papel, unidade e os tipos
-- de alerta que a pessoa silenciou no perfil.
-- Aparelhos e fila só são acessados por funções (nenhum acesso direto às tabelas), porque a assinatura de push é uma
-- credencial de envio.

-- 1) Aparelhos ------------------------------------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 20 and 1000 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 80 and 100),
  auth text not null check (char_length(auth) between 16 and 40),
  device_label text check (device_label is null or char_length(device_label) <= 80),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  failures integer not null default 0,
  disabled_at timestamptz
);
create unique index if not exists push_subscriptions_endpoint_idx on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;

-- 2) Fila de popups --------------------------------------------------------------------------------------------------
create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('alerta','teste')),
  notification_id uuid references public.notifications(id) on delete cascade,
  alert_kind text,
  severity text not null default 'info' check (severity in ('info','atencao','urgente')),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 600),
  link text check (link is null or link ~ '^/admin(/[a-z0-9-]+)?$'),
  status text not null default 'pendente' check (status in ('pendente','enviando','enviado','falhou','cancelado')),
  attempts integer not null default 0,
  last_error text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists push_outbox_alert_idx on public.push_outbox (notification_id, user_id) where notification_id is not null;
create index if not exists push_outbox_queue_idx on public.push_outbox (status, scheduled_for);
drop trigger if exists push_outbox_updated_at on public.push_outbox;
create trigger push_outbox_updated_at before update on public.push_outbox for each row execute function public.set_updated_at();

do $$ declare t text; begin
  foreach t in array array['push_subscriptions','push_outbox'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 3) Quem recebe o popup ----------------------------------------------------------------------------------------------
-- Mesmas regras de _notif_recipients (e-mail), mais: tem aparelho ligado. O e-mail ligado/desligado no perfil não
-- interfere: popup e e-mail são escolhas separadas (popup = ligar o aparelho; e-mail = chave no perfil).
create or replace function public._push_recipients(_org uuid, _kind text, _unit uuid)
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select distinct u.id
    from auth.users u
    join public.user_profiles p on p.id = u.id and p.is_active and coalesce(p.organization_id, _org) = _org
   where (u.banned_until is null or u.banned_until < now())
     and exists (select 1 from public.push_subscriptions s where s.user_id = u.id and s.disabled_at is null)
     and not (_kind = any(coalesce((select np.muted_kinds from public.notification_prefs np where np.user_id = u.id), '{}')))
     and (
       exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'super_admin')
       or (_unit is not null
           and exists (select 1 from public.user_unit_access a where a.user_id = u.id and a.unit_id = _unit)
           and exists (select 1 from public.user_roles r where r.user_id = u.id
                        and (r.role = 'gestor' or (r.role = 'funcionario' and _kind not in ('grupo_grande','falha_envio')))))
       or (_unit is null and exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'gestor'))
     )
$$;
revoke all on function public._push_recipients(uuid,text,uuid) from public, anon, authenticated;

-- 4) Criar alerta: agora também enfileira o popup --------------------------------------------------------------------
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

  begin  -- idem para o popup: nunca atrapalha o alerta nem a reserva
    insert into public.push_outbox (user_id, kind, notification_id, alert_kind, severity, title, body, link)
    select pr.user_id, 'alerta', n, _kind, _severity, left(_title, 160), left(_body, 600), _link
      from public._push_recipients(v_org, _kind, _unit) pr
    on conflict (notification_id, user_id) where notification_id is not null do nothing;
  exception when others then null;
  end;
  return n;
exception when others then
  return null;
end $$;
revoke all on function public._notify(text,uuid,text,text,text,text,uuid) from public, anon, authenticated;

-- 5) Painel: aparelhos da própria pessoa -------------------------------------------------------------------------------
-- Registra (ou atualiza) este aparelho. Se o mesmo navegador já estava ligado a outra conta, passa para quem entrou agora.
create or replace function public.push_subscribe(_endpoint text, _p256dh text, _auth text, _label text default null, _ua text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_new boolean; v_label text := nullif(left(btrim(coalesce(_label, '')), 80), '');
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _endpoint is null or _endpoint !~ '^https://' or char_length(_endpoint) not between 20 and 1000 then raise exception 'INVALID_SUBSCRIPTION'; end if;
  if _p256dh is null or char_length(_p256dh) not between 80 and 100 or _auth is null or char_length(_auth) not between 16 and 40 then raise exception 'INVALID_SUBSCRIPTION'; end if;

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, device_label, user_agent)
  values (auth.uid(), _endpoint, _p256dh, _auth, v_label, nullif(left(coalesce(_ua, ''), 300), ''))
  on conflict (endpoint) do update
     set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
         device_label = coalesce(excluded.device_label, s.device_label), user_agent = coalesce(excluded.user_agent, s.user_agent),
         last_seen_at = now(), disabled_at = null, failures = 0, last_error = null
  returning s.id, (xmax = 0) into v_id, v_new;

  -- no máximo 10 aparelhos por pessoa: some o mais antigo sem uso
  delete from public.push_subscriptions d
   where d.user_id = auth.uid()
     and d.id in (select x.id from public.push_subscriptions x where x.user_id = auth.uid()
                   order by x.last_seen_at desc offset 10);
  if v_new then
    perform public.write_audit('painel', 'usuario.alertas_aparelho_ligado', 'usuario', auth.uid(), null, null,
      jsonb_build_object('aparelho', coalesce(v_label, 'Aparelho')), null);
  end if;
  return v_id;
end $$;
revoke all on function public.push_subscribe(text,text,text,text,text) from public, anon;
grant execute on function public.push_subscribe(text,text,text,text,text) to authenticated;

create or replace function public.push_unsubscribe(_endpoint text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_label text;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  delete from public.push_subscriptions where endpoint = _endpoint and user_id = auth.uid() returning device_label into v_label;
  if found then
    perform public.write_audit('painel', 'usuario.alertas_aparelho_desligado', 'usuario', auth.uid(), null, null,
      jsonb_build_object('aparelho', coalesce(v_label, 'Aparelho')), null);
  end if;
end $$;
revoke all on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_unsubscribe(text) to authenticated;

create or replace function public.push_devices()
returns table (id uuid, device_label text, created_at timestamptz, last_seen_at timestamptz, last_success_at timestamptz, failures integer, disabled boolean, endpoint_tail text)
language sql stable security definer set search_path = public as $$
  select s.id, s.device_label, s.created_at, s.last_seen_at, s.last_success_at, s.failures, s.disabled_at is not null, right(s.endpoint, 12)
    from public.push_subscriptions s
   where s.user_id = auth.uid()
   order by s.last_seen_at desc
$$;
revoke all on function public.push_devices() from public, anon;
grant execute on function public.push_devices() to authenticated;

create or replace function public.push_device_remove(_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_label text;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  delete from public.push_subscriptions where id = _id and user_id = auth.uid() returning device_label into v_label;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.write_audit('painel', 'usuario.alertas_aparelho_desligado', 'usuario', auth.uid(), null, null,
    jsonb_build_object('aparelho', coalesce(v_label, 'Aparelho')), null);
end $$;
revoke all on function public.push_device_remove(uuid) from public, anon;
grant execute on function public.push_device_remove(uuid) to authenticated;

-- Popup de teste para si mesma (no máximo um a cada 15 segundos)
create or replace function public.push_test() returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.push_subscriptions s where s.user_id = auth.uid() and s.disabled_at is null) then raise exception 'NO_DEVICE'; end if;
  if exists (select 1 from public.push_outbox o where o.user_id = auth.uid() and o.kind = 'teste' and o.created_at > now() - interval '15 seconds') then raise exception 'TOO_FAST'; end if;
  insert into public.push_outbox (user_id, kind, severity, title, body, link)
  values (auth.uid(), 'teste', 'info', 'Teste de alerta', 'Deu certo: este aparelho vai receber os alertas do Candeeiro.', '/admin/app')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;

-- 6) Servidor do app (service_role): pegar e dar baixa na fila -----------------------------------------------------------
create or replace function public.sdr_push_claim(_limit integer default 30) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  -- limpeza leve (sem cron)
  delete from public.push_outbox where status in ('enviado','cancelado','falhou') and updated_at < now() - interval '7 days';
  delete from public.push_subscriptions where disabled_at is not null and disabled_at < now() - interval '30 days';
  delete from public.push_subscriptions where last_seen_at < now() - interval '120 days';

  -- popup velho não serve mais (alerta de mais de 3 horas já está no sino e no e-mail)
  update public.push_outbox set status = 'cancelado', last_error = 'expirado'
   where status = 'pendente' and created_at < now() - interval '3 hours';
  update public.push_outbox set status = case when attempts >= 3 then 'falhou' else 'pendente' end,
         last_error = coalesce(last_error, 'sem retorno do envio'), scheduled_for = now() + interval '2 minutes'
   where status = 'enviando' and updated_at < now() - interval '5 minutes';

  with picked as (
    select o.id from public.push_outbox o
     where o.status = 'pendente' and o.scheduled_for <= now() and o.attempts < 3
     order by o.scheduled_for, o.created_at limit least(greatest(1, coalesce(_limit, 30)), 100) for update skip locked
  ), upd as (
    update public.push_outbox o set status = 'enviando', attempts = o.attempts + 1 from picked where o.id = picked.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'kind', u.kind, 'notification_id', u.notification_id, 'alert_kind', coalesce(u.alert_kind, 'teste'),
           'severity', u.severity, 'title', u.title, 'body', u.body, 'link', u.link,
           'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                      from public.push_subscriptions s where s.user_id = u.user_id and s.disabled_at is null)
         ) order by u.created_at), '[]'::jsonb)
    into out from upd u;
  return out;
end $$;
revoke all on function public.sdr_push_claim(integer) from public, anon, authenticated;
grant execute on function public.sdr_push_claim(integer) to service_role;

-- Resultado por aparelho: some se o serviço de push disse que o aparelho não existe mais
create or replace function public.sdr_push_sub_result(_sub uuid, _ok boolean, _gone boolean default false, _error text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if _ok then
    update public.push_subscriptions set last_success_at = now(), failures = 0, last_error = null where id = _sub;
  elsif _gone then
    delete from public.push_subscriptions where id = _sub;
  else
    update public.push_subscriptions set failures = failures + 1, last_error = left(coalesce(_error, 'erro'), 200),
           disabled_at = case when failures + 1 >= 8 then now() else disabled_at end
     where id = _sub;
  end if;
end $$;
revoke all on function public.sdr_push_sub_result(uuid,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.sdr_push_sub_result(uuid,boolean,boolean,text) to service_role;

-- _sent = aparelhos que receberam; _retry = ainda vale tentar de novo (falha de rede / serviço fora)
create or replace function public.sdr_push_mark(_id uuid, _sent integer, _retry boolean default false, _error text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.push_outbox x
     set status = case when _sent > 0 then 'enviado'
                       when _retry and x.attempts < 3 then 'pendente'
                       when not _retry and _error is null then 'cancelado'   -- pessoa sem aparelho ligado
                       else 'falhou' end,
         sent_at = case when _sent > 0 then now() else x.sent_at end,
         last_error = case when _sent > 0 then null else left(_error, 300) end,
         scheduled_for = case when _retry and x.attempts < 3 and _sent = 0 then now() + (x.attempts * interval '2 minutes') else x.scheduled_for end
   where x.id = _id and x.status = 'enviando';
end $$;
revoke all on function public.sdr_push_mark(uuid,integer,boolean,text) from public, anon, authenticated;
grant execute on function public.sdr_push_mark(uuid,integer,boolean,text) to service_role;
