-- 010 — Usuários individuais por convite, audit_log append-only e histórico.
-- Aditiva: não remove triggers existentes (audit_row, log_reservation_status, reservations_*),
-- não altera message_outbox (só leitura via RPC) nem RPCs sdr_*/resolve_unit_prices.

-- 1) Perfil: convite / primeiro acesso -----------------------------------------------
alter table public.user_profiles add column if not exists invited_at timestamptz;
alter table public.user_profiles add column if not exists invited_by uuid;
alter table public.user_profiles add column if not exists needs_onboarding boolean not null default false;

-- Guard: colunas de controle só por super admin OU dentro das RPCs de equipe (flag local da transação).
create or replace function public.guard_user_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id is distinct from old.id then raise exception 'FORBIDDEN'; end if;
  if coalesce(current_setting('app.team_admin', true), '') = 'on' then return new; end if;
  if (new.is_active is distinct from old.is_active
      or new.organization_id is distinct from old.organization_id
      or new.invited_at is distinct from old.invited_at
      or new.invited_by is distinct from old.invited_by)
     and not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'FORBIDDEN';
  end if;
  -- needs_onboarding só pode ser desligado pelo próprio usuário (via complete_first_access)
  if new.needs_onboarding and not old.needs_onboarding and not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end $$;

-- 2) audit_log -----------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  source text not null check (source in ('painel','sdr_whatsapp','landing_page','sistema','crm')),
  action text not null check (char_length(action) between 2 and 60),
  entity_type text,
  entity_id uuid,
  unit_id uuid,
  before jsonb,
  after jsonb,
  note text
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log(entity_type, entity_id, created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log(actor_user_id, created_at desc);
create index if not exists audit_log_unit_idx on public.audit_log(unit_id, created_at desc);

-- Append-only: só leitura pela API; escrita apenas por funções SECURITY DEFINER.
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
grant select, insert on public.audit_log to service_role;
alter table public.audit_log enable row level security;

create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin raise exception 'AUDIT_LOG_APPEND_ONLY'; end $$;
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change before update or delete on public.audit_log
for each row execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
for each statement execute function public.audit_log_immutable();

-- Visibilidade: super admin tudo; gestor suas unidades + o que ele mesmo fez + usuários das suas unidades;
-- funcionário só eventos de reservas/clientes de unidades que acessa.
create or replace function public.can_read_audit(_uid uuid, _entity_type text, _entity_id uuid, _unit_id uuid, _actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'super_admin')
    or (public.has_role(_uid, 'gestor') and (
          _actor = _uid
          or (_unit_id is not null and public.can_manage_unit(_uid, _unit_id))
          or (_entity_type = 'usuario' and exists (
                select 1 from public.user_unit_access a
                where a.user_id = _entity_id and public.can_manage_unit(_uid, a.unit_id)))))
    or (public.is_staff(_uid) and _entity_type in ('reserva','cliente')
        and _unit_id is not null and public.can_access_unit(_uid, _unit_id))
$$;
revoke all on function public.can_read_audit(uuid,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.can_read_audit(uuid,text,uuid,uuid,uuid) to authenticated;

drop policy if exists "audit_log leitura por escopo" on public.audit_log;
create policy "audit_log leitura por escopo" on public.audit_log for select to authenticated
using (public.can_read_audit(auth.uid(), entity_type, entity_id, unit_id, actor_user_id));

-- Gravação central (não exposta à API).
create or replace function public.write_audit(
  _source text, _action text, _entity_type text, _entity_id uuid, _unit_id uuid,
  _before jsonb, _after jsonb, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text; v_role text;
begin
  if v_uid is not null then
    select p.full_name into v_name from public.user_profiles p where p.id = v_uid;
    if v_name is null then select u.email::text into v_name from auth.users u where u.id = v_uid; end if;
    select r.role::text into v_role from public.user_roles r where r.user_id = v_uid
      order by case r.role when 'super_admin' then 1 when 'gestor' then 2 else 3 end limit 1;
  end if;
  insert into public.audit_log (actor_user_id, actor_name, actor_role, source, action, entity_type, entity_id, unit_id, before, after, note)
  values (v_uid, v_name, v_role,
          case when v_uid is not null and _source = 'sistema' then 'painel' else _source end,
          _action, _entity_type, _entity_id, _unit_id, _before, _after, _note);
end $$;
revoke all on function public.write_audit(text,text,text,uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;

-- Trigger genérico: grava no audit_log junto com o audit_row existente.
create or replace function public.audit_log_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_entity text; v_action text; v_unit uuid; v_source text := 'sistema'; v_id uuid; v_note text;
  v_verb text := case tg_op when 'INSERT' then 'criada' when 'UPDATE' then 'editada' else 'excluida' end;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then return new; end if;
  v_id := nullif(v_row->>'id','')::uuid;
  v_unit := nullif(v_row->>'unit_id','')::uuid;

  case tg_table_name
    when 'reservations' then
      v_entity := 'reserva'; v_note := v_row->>'protocol';
      v_source := case v_row->>'origin' when 'sdr_whatsapp' then 'sdr_whatsapp' when 'landing_page' then 'landing_page' else 'sistema' end;
      if tg_op = 'INSERT' then v_action := 'reserva.criada';
      elsif tg_op = 'UPDATE' and (v_old->>'status') is distinct from (v_new->>'status') then
        v_action := case
          when v_old->>'status' = 'pendente' and v_new->>'status' = 'confirmada' then 'reserva.aprovada'
          when v_old->>'status' = 'pendente' and v_new->>'status' = 'cancelada' then 'reserva.recusada'
          when v_new->>'status' = 'cancelada' then 'reserva.cancelada'
          else 'reserva.status_alterado' end;
      elsif tg_op = 'UPDATE' then v_action := 'reserva.editada';
      else v_action := 'reserva.excluida'; end if;
      -- a origem só vale para a criação; mudanças depois sem usuário são do sistema/SDR
      if tg_op <> 'INSERT' and v_source = 'landing_page' then v_source := 'sistema'; end if;
    when 'customers' then
      v_entity := 'cliente'; v_action := 'cliente.' || case tg_op when 'INSERT' then 'criado' when 'UPDATE' then 'editado' else 'excluido' end;
      select r.unit_id into v_unit from public.reservations r where r.customer_id = v_id order by r.created_at desc limit 1;
    when 'units' then v_entity := 'unidade'; v_unit := v_id; v_note := v_row->>'name';
      v_action := 'unidade.' || case tg_op when 'INSERT' then 'criada' when 'UPDATE' then 'editada' else 'excluida' end;
    when 'reservation_capacity_rules' then v_entity := 'capacidade'; v_action := 'capacidade.' || v_verb;
    when 'reservation_blocks' then v_entity := 'bloqueio'; v_action := 'bloqueio.' || case tg_op when 'DELETE' then 'removido' when 'INSERT' then 'criado' else 'editado' end;
    when 'price_tables' then v_entity := 'preco'; v_action := 'preco.' || v_verb;
    when 'price_rules', 'price_child_policies' then v_entity := 'preco'; v_action := 'preco.' || v_verb;
      select t.unit_id into v_unit from public.price_tables t where t.id = nullif(v_row->>'table_id','')::uuid;
    when 'holidays' then v_entity := 'feriado'; v_action := 'config.alterada'; v_note := v_row->>'name';
    when 'sac_tickets' then v_entity := 'sac'; v_note := v_row->>'protocol';
      v_action := case when tg_op = 'INSERT' then 'sac.criado'
                       when tg_op = 'UPDATE' and (v_old->>'status') is distinct from (v_new->>'status') then 'sac.status_alterado'
                       else 'sac.editado' end;
    when 'integration_settings' then v_entity := 'config'; v_action := 'config.alterada'; v_note := v_row->>'provider';
      -- nunca copiar config completa (pode conter dados sensíveis)
      v_old := v_old - 'config'; v_new := v_new - 'config';
    when 'user_roles' then v_entity := 'usuario'; v_id := nullif(v_row->>'user_id','')::uuid;
      v_action := case tg_op when 'DELETE' then 'usuario.papel_removido' else 'usuario.papel_alterado' end;
    when 'user_unit_access' then v_entity := 'usuario'; v_id := nullif(v_row->>'user_id','')::uuid;
      v_action := case tg_op when 'DELETE' then 'usuario.unidade_removida' else 'usuario.unidade_vinculada' end;
    when 'user_profiles' then v_entity := 'usuario';
      if tg_op = 'INSERT' then return new; end if;
      v_action := case
        when (v_old->>'is_active') = 'true' and (v_new->>'is_active') = 'false' then 'usuario.desativado'
        when (v_old->>'is_active') = 'false' and (v_new->>'is_active') = 'true' then 'usuario.reativado'
        else 'usuario.editado' end;
    when 'delivery_orders' then v_entity := 'delivery'; v_note := v_row->>'protocol';
      v_action := case when tg_op = 'INSERT' then 'delivery.criado'
                       when tg_op = 'UPDATE' and (v_old->>'status') is distinct from (v_new->>'status') then 'delivery.status_alterado'
                       else 'delivery.editado' end;
    else v_entity := tg_table_name; v_action := tg_table_name || '.' || lower(tg_op);
  end case;

  perform public.write_audit(v_source, v_action, v_entity, v_id, v_unit, v_old, v_new, v_note);
  return coalesce(new, old);
end $$;
revoke all on function public.audit_log_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['reservations','customers','units','reservation_capacity_rules','reservation_blocks',
    'price_tables','price_rules','price_child_policies','holidays','sac_tickets','integration_settings',
    'user_roles','user_unit_access','user_profiles','delivery_orders']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists zz_audit_log on public.%I', t);
      execute format('create trigger zz_audit_log after insert or update or delete on public.%I for each row execute function public.audit_log_row()', t);
    end if;
  end loop;
end $$;

-- 3) Login / logout / tentativas bloqueadas -----------------------------------------
create or replace function public.log_auth_event(_action text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_active boolean;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if _action not in ('login','logout') then raise exception 'INVALID_ACTION'; end if;
  select p.is_active into v_active from public.user_profiles p where p.id = auth.uid();
  if _action = 'login' and (v_active is distinct from true or not public.is_staff(auth.uid())) then
    perform public.write_audit('painel', 'login.bloqueado', 'usuario', auth.uid(), null, null, null,
      case when v_active is distinct from true then 'Usuário desativado' else 'Sem papel atribuído' end);
    return false;
  end if;
  perform public.write_audit('painel', _action, 'usuario', auth.uid(), null, null, null, null);
  return true;
end $$;

-- 4) Equipe ---------------------------------------------------------------------------
create or replace function public.admin_list_team()
returns table (id uuid, email text, full_name text, is_active boolean, created_at timestamptz,
               last_sign_in_at timestamptz, invited_at timestamptz, needs_onboarding boolean,
               roles public.app_role[], unit_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
declare v_super boolean := public.has_role(auth.uid(), 'super_admin');
begin
  if not (v_super or public.has_role(auth.uid(), 'gestor')) then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, u.email::text, p.full_name, p.is_active, p.created_at, u.last_sign_in_at, p.invited_at, p.needs_onboarding,
         coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}'),
         coalesce((select array_agg(a.unit_id) from public.user_unit_access a where a.user_id = p.id
                   and (v_super or public.can_manage_unit(auth.uid(), a.unit_id))), '{}')
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where v_super or p.id = auth.uid()
     or (not public.has_role(p.id, 'super_admin') and exists (
           select 1 from public.user_unit_access a where a.user_id = p.id and public.can_manage_unit(auth.uid(), a.unit_id)))
  order by p.is_active desc, p.full_name nulls last;
end $$;

-- Verifica se quem chama pode convidar com esse papel/unidades (antes de criar a conta).
create or replace function public.admin_check_invite(_role public.app_role, _unit_ids uuid[])
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_super boolean := public.has_role(auth.uid(), 'super_admin'); u uuid;
begin
  if not (v_super or public.has_role(auth.uid(), 'gestor')) then raise exception 'FORBIDDEN'; end if;
  if not v_super and _role = 'super_admin' then raise exception 'FORBIDDEN_ROLE'; end if;
  if _role <> 'super_admin' and coalesce(array_length(_unit_ids, 1), 0) = 0 then raise exception 'UNITS_REQUIRED'; end if;
  foreach u in array coalesce(_unit_ids, '{}') loop
    if not public.can_manage_unit(auth.uid(), u) then raise exception 'FORBIDDEN_UNIT'; end if;
  end loop;
  return true;
end $$;

-- Gestor só mexe em quem não é super admin e (já está em unidade dele OU ainda não tem papel).
create or replace function public._can_manage_user(_uid uuid, _target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'super_admin')
    or (public.has_role(_uid, 'gestor') and _target <> _uid and not public.has_role(_target, 'super_admin')
        and (not exists (select 1 from public.user_roles r where r.user_id = _target)
             or exists (select 1 from public.user_unit_access a where a.user_id = _target and public.can_manage_unit(_uid, a.unit_id))))
$$;
revoke all on function public._can_manage_user(uuid,uuid) from public, anon, authenticated;

create or replace function public.admin_set_user_access(
  _user_id uuid, _role public.app_role, _unit_ids uuid[], _full_name text default null, _invited boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_super boolean := public.has_role(auth.uid(), 'super_admin'); u uuid; v_org uuid;
begin
  if not public._can_manage_user(auth.uid(), _user_id) then raise exception 'FORBIDDEN'; end if;
  if _user_id = auth.uid() then raise exception 'CANNOT_EDIT_SELF'; end if;
  perform public.admin_check_invite(_role, _unit_ids);
  perform set_config('app.team_admin', 'on', true);

  select organization_id into v_org from public.user_profiles where id = auth.uid();
  if v_org is null then select id into v_org from public.organizations order by created_at limit 1; end if;

  insert into public.user_profiles (id, full_name, organization_id) values (_user_id, nullif(trim(_full_name), ''), v_org)
  on conflict (id) do nothing;
  update public.user_profiles set
    organization_id = coalesce(organization_id, v_org),
    full_name = coalesce(nullif(trim(_full_name), ''), full_name),
    invited_at = case when _invited then now() else invited_at end,
    invited_by = case when _invited then auth.uid() else invited_by end,
    needs_onboarding = case when _invited then true else needs_onboarding end
  where id = _user_id;

  delete from public.user_roles where user_id = _user_id and role <> _role;
  insert into public.user_roles (user_id, role) values (_user_id, _role) on conflict do nothing;

  -- só altera vínculos dentro do escopo de quem chama (gestor não toca unidades de outros)
  delete from public.user_unit_access a where a.user_id = _user_id
    and (v_super or public.can_manage_unit(auth.uid(), a.unit_id))
    and not (a.unit_id = any(coalesce(_unit_ids, '{}')));
  foreach u in array coalesce(_unit_ids, '{}') loop
    insert into public.user_unit_access (user_id, unit_id) values (_user_id, u) on conflict do nothing;
  end loop;

  if _invited then
    perform public.write_audit('painel', 'usuario.convidado', 'usuario', _user_id,
      case when array_length(_unit_ids,1) = 1 then _unit_ids[1] end, null,
      jsonb_build_object('role', _role, 'unit_ids', to_jsonb(coalesce(_unit_ids,'{}')), 'full_name', _full_name), null);
  end if;
end $$;

create or replace function public.admin_set_user_active(_user_id uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _user_id = auth.uid() then raise exception 'CANNOT_EDIT_SELF'; end if;
  if not public._can_manage_user(auth.uid(), _user_id) then raise exception 'FORBIDDEN'; end if;
  perform set_config('app.team_admin', 'on', true);
  update public.user_profiles set is_active = _active where id = _user_id;
end $$;

-- Primeiro acesso: o próprio usuário define o nome e encerra o onboarding.
create or replace function public.complete_first_access(_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if char_length(trim(coalesce(_full_name,''))) < 2 then raise exception 'NAME_REQUIRED'; end if;
  perform set_config('app.team_admin', 'on', true);
  update public.user_profiles set full_name = trim(_full_name), needs_onboarding = false where id = auth.uid();
  perform public.write_audit('painel', 'usuario.primeiro_acesso', 'usuario', auth.uid(), null, null, null, null);
end $$;

-- 5) Linha do tempo da reserva (inclui cliente e mensagens automáticas, só leitura) ----
create or replace function public.get_reservation_timeline(_reservation_id uuid)
returns table (id uuid, created_at timestamptz, kind text, action text, source text,
               actor_name text, actor_role text, before jsonb, after jsonb, note text)
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select x.id, x.unit_id, x.customer_id into r from public.reservations x where x.id = _reservation_id;
  if r.id is null or not public.can_access_unit(auth.uid(), r.unit_id) then raise exception 'FORBIDDEN'; end if;
  return query
  select a.id, a.created_at, 'audit'::text, a.action, a.source, a.actor_name, a.actor_role, a.before, a.after, a.note
  from public.audit_log a
  where (a.entity_type = 'reserva' and a.entity_id = r.id)
     or (a.entity_type = 'cliente' and a.entity_id = r.customer_id)
  union all
  select m.id, coalesce(m.sent_at, m.created_at), 'mensagem'::text, m.event_key, 'sistema'::text, null::text, null::text,
         null::jsonb, jsonb_build_object('status', m.status, 'sent_at', m.sent_at, 'delivered_at', m.delivered_at), m.error
  from public.message_outbox m
  where m.reservation_id = r.id
  order by 2 desc;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.log_auth_event(text)',
    'public.admin_list_team()',
    'public.admin_check_invite(public.app_role,uuid[])',
    'public.admin_set_user_access(uuid,public.app_role,uuid[],text,boolean)',
    'public.admin_set_user_active(uuid,boolean)',
    'public.complete_first_access(text)',
    'public.get_reservation_timeline(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 6) Busca de usuário por e-mail — só para o servidor (registro de login bloqueado).
create or replace function public.auth_user_id_by_email(_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select u.id from auth.users u where lower(u.email) = lower(_email) limit 1
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;