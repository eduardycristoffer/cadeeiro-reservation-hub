-- 019 — Várias lojas (multi-tenant), base de clientes completa, perfil e alertas por tipo
-- Pedido do dono (13/11/2026):
--  * super admin escolhe a loja (organização) que está vendo; admin/gestor/funcionário só enxergam a própria;
--  * aba Contatos = base de clientes com busca, exportação e importação em CSV, e ficha com TODO o histórico
--    (reservas, mudanças de status, SAC, leads, Wi-Fi, mensagens do CRM e log de quem mexeu);
--  * cada pessoa edita o próprio perfil e escolhe quais alertas quer receber (e-mail e sino);
--  * tudo que muda dado grava no log (audit_log) com quem fez.
-- Isolamento: nenhuma função nova devolve dado de unidade que a pessoa não pode acessar (can_access_unit / can_manage_unit).

-- 1) Loja ativa do super admin ------------------------------------------------------------------------------------
-- Tabela à parte (e não coluna em user_profiles) para trocar de loja não poluir o log de "usuário editado".
create table if not exists public.user_active_org (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  updated_at timestamptz not null default now()
);
revoke all on public.user_active_org from anon, authenticated;
grant all on public.user_active_org to service_role;
alter table public.user_active_org enable row level security;
-- sem policy: ninguém lê/escreve direto; só as funções abaixo (security definer)

-- Organização "em uso" por quem está logado: super admin → a que escolheu; os demais → a do próprio perfil.
create or replace function public._ad_scope_org()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.organization_id from public.user_active_org a
      where a.user_id = auth.uid() and public.has_role(auth.uid(), 'super_admin')),
    (select p.organization_id from public.user_profiles p where p.id = auth.uid()),
    public._default_org())
$$;
revoke all on function public._ad_scope_org() from public, anon, authenticated;

create or replace function public.platform_organizations()
returns table (id uuid, name text, slug text, units integer, users integer, is_active_org boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
    select o.id, o.name, o.slug,
           (select count(*)::int from public.units u where u.organization_id = o.id),
           (select count(*)::int from public.user_profiles p where p.organization_id = o.id),
           (o.id = public._ad_scope_org())
      from public.organizations o order by o.created_at;
end $$;
revoke all on function public.platform_organizations() from public, anon;
grant execute on function public.platform_organizations() to authenticated;

create or replace function public.platform_switch_organization(_org uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_prev uuid := public._ad_scope_org(); v_name text;
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  select name into v_name from public.organizations where id = _org;
  if v_name is null then raise exception 'NOT_FOUND'; end if;
  insert into public.user_active_org (user_id, organization_id) values (auth.uid(), _org)
  on conflict (user_id) do update set organization_id = excluded.organization_id, updated_at = now();
  if v_prev is distinct from _org then
    perform public.write_audit('painel', 'plataforma.loja_trocada', 'organization', _org, null,
      jsonb_build_object('de', v_prev), jsonb_build_object('para', _org, 'nome', v_name), null);
  end if;
  return _org;
end $$;
revoke all on function public.platform_switch_organization(uuid) from public, anon;
grant execute on function public.platform_switch_organization(uuid) to authenticated;

create or replace function public.platform_create_organization(_name text, _slug text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_slug text; v_id uuid;
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  if _name is null or char_length(btrim(_name)) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  v_slug := lower(regexp_replace(coalesce(nullif(btrim(_slug), ''), _name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  if v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'INVALID_SLUG'; end if;
  if exists (select 1 from public.organizations where slug = v_slug) then raise exception 'SLUG_EXISTS'; end if;
  insert into public.organizations (name, slug) values (btrim(_name), v_slug) returning id into v_id;
  perform public.write_audit('painel', 'plataforma.loja_criada', 'organization', v_id, null, null,
    jsonb_build_object('nome', btrim(_name), 'slug', v_slug), null);
  return v_id;
end $$;
revoke all on function public.platform_create_organization(text,text) from public, anon;
grant execute on function public.platform_create_organization(text,text) to authenticated;

-- Tudo que o painel precisa para saber "onde estou": loja ativa, lojas que posso trocar, unidades que posso ver
-- e a unidade padrão (quem tem uma só — gestor da loja — já cai nela).
create or replace function public.my_scope()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_super boolean; v_org uuid; v_orgs jsonb; v_units jsonb; v_role text; v_name text; v_org_name text;
begin
  if v_uid is null or not public.is_staff(v_uid) then raise exception 'FORBIDDEN'; end if;
  v_super := public.has_role(v_uid, 'super_admin');
  v_org := public._ad_scope_org();
  select r.role::text into v_role from public.user_roles r where r.user_id = v_uid
    order by case r.role when 'super_admin' then 1 when 'gestor' then 2 else 3 end limit 1;
  select o.name into v_org_name from public.organizations o where o.id = v_org;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug) order by o.created_at), '[]'::jsonb)
    into v_orgs from public.organizations o where v_super or o.id = v_org;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'slug', u.slug, 'city', u.city, 'is_active', u.is_active)
                            order by u.sort_order, u.name), '[]'::jsonb)
    into v_units from public.units u
   where u.organization_id = v_org and public.can_access_unit(v_uid, u.id);
  return jsonb_build_object('is_super_admin', v_super, 'role', v_role, 'organization_id', v_org, 'organization_name', v_org_name,
    'organizations', v_orgs, 'units', v_units,
    'default_unit_id', case when jsonb_array_length(v_units) = 1 then v_units -> 0 ->> 'id' end);
end $$;
revoke all on function public.my_scope() from public, anon;
grant execute on function public.my_scope() to authenticated;

-- 2) Clientes: de onde vieram e a qual unidade pertencem ---------------------------------------------------------------
alter table public.customers add column if not exists origin_unit_id uuid references public.units(id) on delete set null;
alter table public.customers add column if not exists source text not null default 'painel';
alter table public.customers drop constraint if exists customers_source_check;
alter table public.customers add constraint customers_source_check
  check (source in ('painel','reserva_site','whatsapp','importacao','wifi','delivery','outro'));
create index if not exists customers_origin_unit_idx on public.customers (origin_unit_id) where origin_unit_id is not null;
create index if not exists customers_name_idx on public.customers (organization_id, lower(full_name));

-- Quem pode ver o cliente: super admin da loja ativa, ou quem acessa alguma unidade ligada a ele (reserva, SAC, pedido, origem).
create or replace function public._customer_visible(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.customers c
     where c.id = _cid
       and (
         (public.has_role(auth.uid(), 'super_admin') and c.organization_id = public._ad_scope_org())
         or (public.is_staff(auth.uid()) and (
              (c.origin_unit_id is not null and public.can_access_unit(auth.uid(), c.origin_unit_id))
           or exists (select 1 from public.reservations r where r.customer_id = c.id and public.can_access_unit(auth.uid(), r.unit_id))
           or exists (select 1 from public.sac_tickets s where s.customer_id = c.id and s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id))
           or exists (select 1 from public.delivery_orders d where d.customer_id = c.id and public.can_access_unit(auth.uid(), d.unit_id))))))
$$;
revoke all on function public._customer_visible(uuid) from public, anon, authenticated;

alter policy "staff lê clientes de suas unidades" on public.customers
using (public.has_role(auth.uid(), 'super_admin')
  or (origin_unit_id is not null and public.can_access_unit(auth.uid(), origin_unit_id))
  or exists (select 1 from public.reservations r where r.customer_id = customers.id and public.can_access_unit(auth.uid(), r.unit_id))
  or exists (select 1 from public.sac_tickets s where s.customer_id = customers.id and s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id))
  or exists (select 1 from public.delivery_orders d where d.customer_id = customers.id and public.can_access_unit(auth.uid(), d.unit_id)));

-- Cliente editado/criado no log já aponta a unidade de origem (assim o gestor da loja enxerga o histórico dele).
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
      v_unit := nullif(v_row->>'origin_unit_id','')::uuid;
      if v_unit is null then
        select r.unit_id into v_unit from public.reservations r where r.customer_id = v_id order by r.created_at desc limit 1;
      end if;
      v_note := v_row->>'phone_e164';
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
-- 3) Base de clientes ---------------------------------------------------------------------------------------------------
create or replace function public.customers_directory(_q text default null, _unit uuid default null, _limit integer default 50, _offset integer default 0)
returns table (id uuid, full_name text, phone_e164 text, email text, notes text, whatsapp_opt_in boolean, source text,
               unit_id uuid, unit_name text, reservations_count integer, last_reservation date, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_q text := nullif(btrim(coalesce(_q, '')), ''); v_digits text := regexp_replace(coalesce(_q, ''), '\D', '', 'g');
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _unit is not null and not public.can_access_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  _limit := least(greatest(coalesce(_limit, 50), 1), 5000);
  _offset := greatest(coalesce(_offset, 0), 0);
  return query
  select c.id, c.full_name, c.phone_e164, c.email, c.notes, c.whatsapp_opt_in, c.source,
         coalesce(c.origin_unit_id, lr.unit_id), un.name,
         coalesce(rc.n, 0)::int, rc.last_date, c.created_at, count(*) over ()
    from public.customers c
    left join lateral (select r.unit_id from public.reservations r where r.customer_id = c.id order by r.reservation_date desc limit 1) lr on true
    left join public.units un on un.id = coalesce(c.origin_unit_id, lr.unit_id)
    left join lateral (select count(*) n, max(r.reservation_date) last_date from public.reservations r
                        where r.customer_id = c.id and public.can_access_unit(auth.uid(), r.unit_id)) rc on true
   where c.organization_id = v_org
     and public._customer_visible(c.id)
     and (_unit is null or c.origin_unit_id = _unit or exists (select 1 from public.reservations r where r.customer_id = c.id and r.unit_id = _unit))
     and (v_q is null
          or c.full_name ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%'
          or (char_length(v_digits) >= 3 and c.phone_e164 like '%' || v_digits || '%')
          or c.email ilike '%' || replace(replace(v_q, '%', ''), '_', '') || '%')
   order by c.created_at desc, c.id
   limit _limit offset _offset;
end $$;
revoke all on function public.customers_directory(text,uuid,integer,integer) from public, anon;
grant execute on function public.customers_directory(text,uuid,integer,integer) to authenticated;

-- Ficha completa. Só entra o que está em unidades que a pessoa pode acessar.
create or replace function public.customer_profile(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.customers; v_uid uuid := auth.uid(); res jsonb;
begin
  if v_uid is null or not public.is_staff(v_uid) then raise exception 'FORBIDDEN'; end if;
  if not public._customer_visible(_id) then raise exception 'NOT_FOUND'; end if;
  select * into c from public.customers where id = _id;
  with rs as (
    select r.*, un.name as unit_name from public.reservations r join public.units un on un.id = r.unit_id
     where r.customer_id = _id and public.can_access_unit(v_uid, r.unit_id)
  )
  select jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'full_name', c.full_name, 'phone_e164', c.phone_e164, 'email', c.email, 'notes', c.notes,
      'whatsapp_opt_in', c.whatsapp_opt_in, 'whatsapp_opt_out_at', c.whatsapp_opt_out_at, 'source', c.source,
      'origin_unit_id', c.origin_unit_id, 'created_at', c.created_at, 'updated_at', c.updated_at),
    'stats', jsonb_build_object(
      'reservas', (select count(*) from rs),
      'concluidas', (select count(*) from rs where status = 'concluida'),
      'canceladas', (select count(*) from rs where status = 'cancelada'),
      'nao_compareceu', (select count(*) from rs where status = 'nao_compareceu'),
      'pessoas', (select coalesce(sum(party_size) filter (where status = 'concluida'), 0) from rs),
      'primeira', (select min(reservation_date) from rs),
      'ultima', (select max(reservation_date) from rs where status <> 'cancelada')),
    'reservations', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'protocol', protocol, 'date', reservation_date, 'time', to_char(reservation_time, 'HH24:MI'),
        'party_size', party_size, 'status', status, 'origin', origin, 'unit', unit_name, 'notes', notes, 'created_at', created_at)
        order by reservation_date desc, reservation_time desc), '[]'::jsonb) from (select * from rs order by reservation_date desc limit 100) q),
    'status_history', (select coalesce(jsonb_agg(jsonb_build_object('protocol', rs.protocol, 'from', h.from_status, 'to', h.to_status,
        'by', coalesce(p.full_name, 'Sistema / cliente'), 'note', h.note, 'at', h.created_at) order by h.created_at desc), '[]'::jsonb)
        from public.reservation_status_history h join rs on rs.id = h.reservation_id left join public.user_profiles p on p.id = h.changed_by),
    'sac', (select coalesce(jsonb_agg(jsonb_build_object('protocol', s.protocol, 'category', s.category, 'subject', s.subject, 'status', s.status,
        'created_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
        from public.sac_tickets s where s.customer_id = _id and s.unit_id is not null and public.can_access_unit(v_uid, s.unit_id)),
    'leads', (select coalesce(jsonb_agg(jsonb_build_object('created_at', l.created_at, 'city', l.city, 'status', l.status,
        'campaign', l.utm_campaign, 'origin', l.origin) order by l.created_at desc), '[]'::jsonb)
        from public.whatsapp_leads l where l.phone_e164 = c.phone_e164 and public.can_access_unit(v_uid, l.unit_id)),
    'wifi', (select coalesce(jsonb_agg(jsonb_build_object('first_seen_at', w.first_seen_at, 'last_seen_at', w.last_seen_at, 'visits', w.visits) order by w.last_seen_at desc), '[]'::jsonb)
        from public.wifi_guests w where (w.customer_id = _id or w.phone_e164 = c.phone_e164) and (w.unit_id is null or public.can_access_unit(v_uid, w.unit_id))),
    'crm', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'status', x.status, 'text', x.text, 'sent_at', x.sent_at, 'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
        from (select * from public.crm_sends s where s.customer_id = _id and (s.unit_id is null or public.can_access_unit(v_uid, s.unit_id)) order by s.created_at desc limit 50) x),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('type', k.consent_type, 'granted', k.granted, 'source', k.source, 'at', k.created_at) order by k.created_at desc), '[]'::jsonb)
        from public.customer_consents k where k.customer_id = _id),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'who', coalesce(a.actor_name, 'Sistema'), 'role', a.actor_role,
        'source', a.source, 'action', a.action, 'note', a.note) order by a.created_at desc), '[]'::jsonb)
        from (select * from public.audit_log a where (a.entity_type = 'cliente' and a.entity_id = _id)
                 or (a.entity_type = 'reserva' and a.entity_id in (select id from rs)) order by a.created_at desc limit 150) a)
  ) into res;
  return res;
end $$;
revoke all on function public.customer_profile(uuid) from public, anon;
grant execute on function public.customer_profile(uuid) to authenticated;

create or replace function public.customer_save(_id uuid, _full_name text, _phone text, _email text, _notes text, _unit uuid, _opt_in boolean default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_phone text := public.normalize_br_phone(_phone); v_name text := btrim(coalesce(_full_name, ''));
        v_email text := nullif(lower(btrim(coalesce(_email, ''))), ''); v_notes text := nullif(btrim(coalesce(_notes, '')), ''); v_id uuid; old public.customers;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'INVALID_EMAIL'; end if;
  if v_notes is not null and char_length(v_notes) > 1000 then raise exception 'INVALID_NOTES'; end if;
  if _id is null then
    if _unit is null or not public.can_access_unit(auth.uid(), _unit)
       or not exists (select 1 from public.units u where u.id = _unit and u.organization_id = v_org) then raise exception 'FORBIDDEN'; end if;
    if exists (select 1 from public.customers c where c.organization_id = v_org and c.phone_e164 = v_phone) then raise exception 'PHONE_EXISTS'; end if;
    insert into public.customers (organization_id, full_name, phone_e164, email, notes, whatsapp_opt_in, whatsapp_opt_out_at, source, origin_unit_id)
    values (v_org, v_name, v_phone, v_email, v_notes, coalesce(_opt_in, false), null, 'painel', _unit) returning id into v_id;
    if coalesce(_opt_in, false) then
      insert into public.customer_consents (customer_id, consent_type, granted, source) values (v_id, 'whatsapp_marketing', true, 'painel');
    end if;
  else
    if not public._customer_visible(_id) then raise exception 'NOT_FOUND'; end if;
    select * into old from public.customers where id = _id for update;
    if exists (select 1 from public.customers c where c.organization_id = old.organization_id and c.phone_e164 = v_phone and c.id <> _id) then raise exception 'PHONE_EXISTS'; end if;
    update public.customers set full_name = v_name, phone_e164 = v_phone, email = v_email, notes = v_notes, updated_at = now(),
           whatsapp_opt_in = coalesce(_opt_in, whatsapp_opt_in),
           whatsapp_opt_out_at = case when _opt_in is null then whatsapp_opt_out_at when _opt_in then null else coalesce(whatsapp_opt_out_at, now()) end
     where id = _id;
    if _opt_in is not null and _opt_in is distinct from old.whatsapp_opt_in then
      insert into public.customer_consents (customer_id, consent_type, granted, source) values (_id, 'whatsapp_marketing', _opt_in, 'painel');
    end if;
    v_id := _id;
  end if;
  return v_id;
end $$;
revoke all on function public.customer_save(uuid,text,text,text,text,uuid,boolean) from public, anon;
grant execute on function public.customer_save(uuid,text,text,text,text,uuid,boolean) to authenticated;

-- Importação (CSV já convertido em JSON pelo painel): [{nome, telefone, email, observacoes, aceita_whatsapp}]
-- Só gestor da unidade (ou super admin). Telefone repetido não duplica: completa e-mail/observação que estavam vazios.
create or replace function public.customers_import(_rows jsonb, _unit uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_org uuid := public._ad_scope_org(); r jsonb; i int := 0; n_new int := 0; n_upd int := 0; n_same int := 0; errs jsonb := '[]'::jsonb;
  v_name text; v_phone text; v_email text; v_notes text; v_opt boolean; ex public.customers; v_id uuid;
begin
  if _unit is null or not public.can_manage_unit(auth.uid(), _unit)
     or not exists (select 1 from public.units u where u.id = _unit and u.organization_id = v_org) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) = 0 then raise exception 'EMPTY_IMPORT'; end if;
  if jsonb_array_length(_rows) > 5000 then raise exception 'TOO_MANY_ROWS'; end if;
  for r in select * from jsonb_array_elements(_rows) loop
    i := i + 1;
    v_name := btrim(coalesce(r ->> 'nome', ''));
    v_phone := public.normalize_br_phone(r ->> 'telefone');
    v_email := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
    v_notes := nullif(left(btrim(coalesce(r ->> 'observacoes', '')), 1000), '');
    v_opt := lower(btrim(coalesce(r ->> 'aceita_whatsapp', ''))) in ('sim', 's', 'true', '1', 'yes');
    if char_length(v_name) not between 2 and 120 then errs := errs || jsonb_build_object('linha', i, 'motivo', 'nome inválido');
    elsif v_phone is null then errs := errs || jsonb_build_object('linha', i, 'motivo', 'telefone inválido');
    elsif v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then errs := errs || jsonb_build_object('linha', i, 'motivo', 'e-mail inválido');
    else
      select * into ex from public.customers c where c.organization_id = v_org and c.phone_e164 = v_phone;
      if found then
        if (ex.email is null and v_email is not null) or (ex.notes is null and v_notes is not null) then
          update public.customers set email = coalesce(email, v_email), notes = coalesce(notes, v_notes), updated_at = now() where id = ex.id;
          n_upd := n_upd + 1;
        else n_same := n_same + 1; end if;
      else
        insert into public.customers (organization_id, full_name, phone_e164, email, notes, whatsapp_opt_in, source, origin_unit_id)
        values (v_org, v_name, v_phone, v_email, v_notes, v_opt, 'importacao', _unit) returning id into v_id;
        if v_opt then insert into public.customer_consents (customer_id, consent_type, granted, source) values (v_id, 'whatsapp_marketing', true, 'importacao'); end if;
        n_new := n_new + 1;
      end if;
    end if;
  end loop;
  perform public.write_audit('painel', 'cliente.importado', 'cliente', null, _unit, null,
    jsonb_build_object('criados', n_new, 'atualizados', n_upd, 'ja_existiam', n_same, 'com_erro', jsonb_array_length(errs), 'linhas', i), null);
  return jsonb_build_object('criados', n_new, 'atualizados', n_upd, 'ja_existiam', n_same, 'erros', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(errs) e limit 50) x), 'total_erros', jsonb_array_length(errs));
end $$;
revoke all on function public.customers_import(jsonb,uuid) from public, anon;
grant execute on function public.customers_import(jsonb,uuid) to authenticated;

-- Exportação baixa o arquivo no navegador; aqui só fica registrado quem exportou, quantos e de qual unidade.
create or replace function public.customers_export_log(_count integer, _unit uuid default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _unit is not null and not public.can_manage_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  perform public.write_audit('painel', 'cliente.exportado', 'cliente', null, _unit, null,
    jsonb_build_object('quantidade', greatest(coalesce(_count, 0), 0)), null);
end $$;
revoke all on function public.customers_export_log(integer,uuid) from public, anon;
grant execute on function public.customers_export_log(integer,uuid) to authenticated;

-- 4) Perfil e alertas por tipo ---------------------------------------------------------------------------------------------
alter table public.notification_prefs add column if not exists muted_kinds text[] not null default '{}';

create or replace function public._notif_recipients(_org uuid, _kind text, _unit uuid)
returns table (email text) language sql stable security definer set search_path = public as $$
  select distinct lower(btrim(u.email))
    from auth.users u
    join public.user_profiles p on p.id = u.id and p.is_active and coalesce(p.organization_id, _org) = _org
   where u.email is not null and btrim(u.email) <> ''
     and (u.banned_until is null or u.banned_until < now())
     and coalesce((select np.email_alerts from public.notification_prefs np where np.user_id = u.id), true)
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
revoke all on function public._notif_recipients(uuid,text,uuid) from public, anon, authenticated;

create or replace function public.notification_prefs_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email_alerts', coalesce((select p.email_alerts from public.notification_prefs p where p.user_id = auth.uid()), true),
    'muted_kinds', to_jsonb(coalesce((select p.muted_kinds from public.notification_prefs p where p.user_id = auth.uid()), '{}'::text[])))
   where auth.uid() is not null
$$;
revoke all on function public.notification_prefs_get() from public, anon;
grant execute on function public.notification_prefs_get() to authenticated;

drop function if exists public.notification_prefs_set(boolean);
create or replace function public.notification_prefs_set(_email_alerts boolean, _muted_kinds text[] default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_old jsonb := public.notification_prefs_get(); v_muted text[];
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _muted_kinds is not null and not (_muted_kinds <@ public._notif_kinds()) then raise exception 'INVALID_KIND'; end if;
  v_muted := coalesce(_muted_kinds, (select p.muted_kinds from public.notification_prefs p where p.user_id = auth.uid()), '{}');
  insert into public.notification_prefs as p (user_id, email_alerts, muted_kinds) values (auth.uid(), coalesce(_email_alerts, true), v_muted)
  on conflict (user_id) do update set email_alerts = excluded.email_alerts, muted_kinds = excluded.muted_kinds, updated_at = now();
  perform public.write_audit('painel', 'usuario.alertas_preferencias', 'usuario', auth.uid(), null, v_old, public.notification_prefs_get(), null);
end $$;
revoke all on function public.notification_prefs_set(boolean,text[]) from public, anon;
grant execute on function public.notification_prefs_set(boolean,text[]) to authenticated;

-- Cada pessoa edita o próprio nome e telefone (o log registra como "usuário editado").
create or replace function public.profile_update(_full_name text, _phone text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_name text := btrim(coalesce(_full_name, '')); v_phone text := null;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'INVALID_NAME'; end if;
  if nullif(btrim(coalesce(_phone, '')), '') is not null then
    v_phone := public.normalize_br_phone(_phone);
    if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  end if;
  update public.user_profiles set full_name = v_name, phone = v_phone, updated_at = now() where id = auth.uid();
end $$;
revoke all on function public.profile_update(text,text) from public, anon;
grant execute on function public.profile_update(text,text) to authenticated;

-- Troca de senha (pelo perfil ou pela redefinição) fica no log: quem e quando (nunca a senha).
create or replace function public.log_password_change(_via text default 'perfil')
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  perform public.write_audit('painel', 'usuario.senha_alterada', 'usuario', auth.uid(), null, null,
    jsonb_build_object('via', case when _via = 'redefinicao' then 'redefinicao' else 'perfil' end), null);
end $$;
revoke all on function public.log_password_change(text) from public, anon;
grant execute on function public.log_password_change(text) to authenticated;

-- O sino também respeita os tipos que a pessoa silenciou no perfil.
create or replace function public.notifications_unread_count() returns integer
language sql stable security invoker set search_path = public as $$
  select count(*)::integer from public.notifications n
   where n.created_at > now() - interval '14 days'
     and not exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = auth.uid())
     and not (n.kind = any(coalesce((select p.muted_kinds from public.notification_prefs p where p.user_id = auth.uid()), '{}')))
$$;
revoke all on function public.notifications_unread_count() from public, anon;
grant execute on function public.notifications_unread_count() to authenticated;

-- Gasto em anúncios sem unidade ("toda a rede") só o super admin lança; gestor lança na própria unidade.
create or replace function public.ad_spend_save(_date date, _platform text, _campaign text, _unit uuid, _amount numeric,
  _impressions integer default null, _clicks integer default null, _leads integer default null, _notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_id uuid; v_camp text := coalesce(lower(btrim(_campaign)), '');
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _unit is not null and not public.can_manage_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  if _unit is null and not public.has_role(auth.uid(), 'super_admin') then raise exception 'UNIT_REQUIRED'; end if;
  if _date is null or _date > current_date + 1 or _date < current_date - 800 then raise exception 'INVALID_DATE'; end if;
  if _amount is null or _amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_camp <> '' and v_camp !~ '^[a-z0-9_-]{1,60}$' then raise exception 'INVALID_CAMPAIGN'; end if;
  insert into public.ad_spend as a (organization_id, spend_date, platform, campaign, unit_id, amount, impressions, clicks, leads_reported, notes, created_by)
  values (v_org, _date, coalesce(_platform,'meta'), v_camp, _unit, _amount, _impressions, _clicks, _leads, nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  on conflict (organization_id, spend_date, platform, campaign, (coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set amount = excluded.amount, impressions = excluded.impressions, clicks = excluded.clicks,
                leads_reported = excluded.leads_reported, notes = excluded.notes
  returning a.id into v_id;
  perform public.write_audit('painel', 'anuncio.gasto_salvo', 'ad_spend', v_id, _unit, null,
    jsonb_build_object('data', _date, 'plataforma', coalesce(_platform,'meta'), 'campanha', v_camp, 'valor', _amount), null);
  return v_id;
end $$;
revoke all on function public.ad_spend_save(date,text,text,uuid,numeric,integer,integer,integer,text) from public, anon;
grant execute on function public.ad_spend_save(date,text,text,uuid,numeric,integer,integer,integer,text) to authenticated;

create or replace function public.ad_spend_import(_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._ad_scope_org(); r jsonb; i int := 0; ok int := 0; errs jsonb := '[]'::jsonb;
  v_date date; v_unit uuid; v_amount numeric; v_camp text; v_plat text; v_slug text;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) = 0 then raise exception 'EMPTY_IMPORT'; end if;
  if jsonb_array_length(_rows) > 500 then raise exception 'IMPORT_TOO_LARGE'; end if;
  for r in select * from jsonb_array_elements(_rows) loop
    i := i + 1;
    begin
      v_date := (r->>'data')::date;
      v_amount := replace(coalesce(r->>'valor','x'), ',', '.')::numeric;
      v_camp := coalesce(lower(btrim(r->>'campanha')), '');
      v_plat := coalesce(nullif(lower(btrim(r->>'plataforma')), ''), 'meta');
      v_slug := nullif(lower(btrim(coalesce(r->>'unidade',''))), '');
      v_unit := null;
      if v_slug is null and not public.has_role(auth.uid(), 'super_admin') then raise exception 'unidade obrigatória'; end if;
      if v_slug is not null then
        select id into v_unit from public.units where organization_id = v_org and slug = v_slug;
        if v_unit is null then raise exception 'unidade desconhecida: %', v_slug; end if;
      end if;
      if v_unit is not null and not public.can_manage_unit(auth.uid(), v_unit) then raise exception 'sem acesso à unidade'; end if;
      if v_date > current_date + 1 or v_date < current_date - 800 then raise exception 'data fora do intervalo'; end if;
      if v_plat not in ('meta','google','tiktok','outro') then raise exception 'plataforma inválida: %', v_plat; end if;
      if v_camp <> '' and v_camp !~ '^[a-z0-9_-]{1,60}$' then raise exception 'campanha inválida'; end if;
      insert into public.ad_spend as a (organization_id, spend_date, platform, campaign, unit_id, amount, impressions, clicks, leads_reported, created_by)
      values (v_org, v_date, v_plat, v_camp, v_unit, v_amount,
              nullif(r->>'impressoes','')::int, nullif(r->>'cliques','')::int, nullif(r->>'leads','')::int, auth.uid())
      on conflict (organization_id, spend_date, platform, campaign, (coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      do update set amount = excluded.amount, impressions = excluded.impressions, clicks = excluded.clicks, leads_reported = excluded.leads_reported;
      ok := ok + 1;
    exception when others then
      errs := errs || jsonb_build_array(jsonb_build_object('linha', i, 'erro', left(sqlerrm, 120)));
    end;
  end loop;
  perform public.write_audit('painel', 'anuncio.importacao', 'ad_spend', null, null, null,
    jsonb_build_object('linhas', i, 'importadas', ok, 'com_erro', i - ok), null);
  return jsonb_build_object('importadas', ok, 'com_erro', i - ok, 'erros', errs);
end $$;
revoke all on function public.ad_spend_import(jsonb) from public, anon;
grant execute on function public.ad_spend_import(jsonb) to authenticated;

