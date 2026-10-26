-- =====================================================================
-- Cadeeiro Gestão — Fases 1, 2 e 3
-- Banco de dados, segurança (RLS), autenticação, unidades, capacidade
-- e criação pública de reservas com controle transacional.
-- Aplicar no SQL Editor do Supabase próprio (uma única vez).
-- Fuso: America/Sao_Paulo
-- =====================================================================

create extension if not exists pgcrypto;

-- Tipos -----------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'gestor', 'funcionario');
create type public.reservation_status as enum ('pendente', 'confirmada', 'cancelada', 'concluida', 'nao_compareceu');
create type public.reservation_origin as enum ('landing_page', 'sdr_whatsapp', 'painel', 'telefone', 'outro');
create type public.block_kind as enum ('manual', 'feriado', 'data_especial');
create type public.sac_category as enum ('reclamacao', 'elogio', 'sugestao', 'duvida', 'problema_reserva', 'atendimento', 'outros');
create type public.sac_status as enum ('aberto', 'em_andamento', 'aguardando_cliente', 'resolvido', 'encerrado');
create type public.sac_priority as enum ('baixa', 'media', 'alta', 'urgente');
create type public.crm_classification as enum (
  'interesse_reserva', 'reserva_realizada', 'consulta_reserva', 'alteracao_reserva', 'cancelamento',
  'sac_reclamacao', 'elogio', 'sugestao', 'duvida_geral', 'outros', 'atendimento_humano');
create type public.queue_status as enum ('pendente', 'processando', 'enviado', 'entregue', 'lido', 'falhou', 'cancelado');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- Organizações e unidades -----------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  address text,
  city text,
  phone text,
  description text,
  photo_url text,
  is_active boolean not null default true,
  accepts_online_reservations boolean not null default true,
  min_advance_minutes integer not null default 60 check (min_advance_minutes >= 0),
  max_advance_days integer not null default 60 check (max_advance_days between 1 and 365),
  large_group_threshold integer not null default 10 check (large_group_threshold >= 1),
  auto_confirm boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index units_org_idx on public.units(organization_id);

-- Perfis, papéis e acesso por unidade ----------------------------------
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  full_name text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.user_unit_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, unit_id)
);
create index user_unit_access_unit_idx on public.user_unit_access(unit_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

create or replace function public.can_access_unit(_user_id uuid, _unit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'super_admin')
      or exists (select 1 from public.user_unit_access a
                 join public.user_profiles p on p.id = a.user_id and p.is_active
                 where a.user_id = _user_id and a.unit_id = _unit_id)
$$;

create or replace function public.can_manage_unit(_user_id uuid, _unit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'super_admin')
      or (public.has_role(_user_id, 'gestor') and public.can_access_unit(_user_id, _unit_id))
$$;

-- perfil automático no cadastro (sem papel: sem acesso até atribuição)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Clientes e consentimentos ----------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone_e164 text not null,
  email text,
  notes text,
  whatsapp_opt_in boolean not null default false,
  whatsapp_opt_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone_e164)
);
create index customers_phone_idx on public.customers(phone_e164);

create table public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  consent_type text not null,
  granted boolean not null,
  source text not null,
  policy_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_consents_customer_idx on public.customer_consents(customer_id);

-- Capacidade, bloqueios e reservas ---------------------------------------
create table public.reservation_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 5 and 240),
  max_guests_per_slot integer not null check (max_guests_per_slot > 0),
  max_party_size integer not null default 20 check (max_party_size > 0),
  is_active boolean not null default true,
  shift_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index capacity_rules_unit_weekday_idx on public.reservation_capacity_rules(unit_id, weekday);

create table public.reservation_blocks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  block_date date not null,
  start_time time,
  end_time time,
  kind public.block_kind not null default 'manual',
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time))
);
create index reservation_blocks_unit_date_idx on public.reservation_blocks(unit_id, block_date);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  reservation_date date not null,
  reservation_time time not null,
  party_size integer not null check (party_size between 1 and 200),
  notes text,
  origin public.reservation_origin not null default 'painel',
  status public.reservation_status not null default 'pendente',
  is_large_group boolean not null default false,
  assigned_to uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  arrived_at timestamptz,
  external_ref text,
  table_id uuid, -- evolução futura: mesas
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reservations_unit_date_idx on public.reservations(unit_id, reservation_date, reservation_time);
create index reservations_status_idx on public.reservations(status);
create index reservations_customer_idx on public.reservations(customer_id);

create table public.reservation_status_history (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  from_status public.reservation_status,
  to_status public.reservation_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reservation_status_history_res_idx on public.reservation_status_history(reservation_id);

create or replace function public.log_reservation_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_status_history (reservation_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.reservation_status_history (reservation_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
    if new.status = 'confirmada' then new.confirmed_at := coalesce(new.confirmed_at, now()); end if;
    if new.status = 'cancelada' then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
  end if;
  return new;
end $$;

-- SAC ------------------------------------------------------------------
create table public.sac_tickets (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  category public.sac_category not null,
  subject text not null,
  description text,
  priority public.sac_priority not null default 'media',
  status public.sac_status not null default 'aberto',
  assigned_to uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  human_requested boolean not null default false,
  origin text not null default 'painel',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sac_tickets_unit_status_idx on public.sac_tickets(unit_id, status);

create table public.sac_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.sac_tickets(id) on delete cascade,
  event_type text not null,
  body text,
  from_status public.sac_status,
  to_status public.sac_status,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sac_ticket_events_ticket_idx on public.sac_ticket_events(ticket_id);

-- CRM (Tryade) ------------------------------------------------------------
create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  external_id text not null,
  phone_e164 text,
  display_name text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);
create index crm_contacts_phone_idx on public.crm_contacts(phone_e164);

create table public.crm_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  external_id text not null,
  channel text not null default 'whatsapp',
  intent text,
  classification public.crm_classification,
  tags text[] not null default '{}',
  unit_id uuid references public.units(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  sac_ticket_id uuid references public.sac_tickets(id) on delete set null,
  result text,
  origin text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);
create index crm_conversations_unit_idx on public.crm_conversations(unit_id);

create table public.crm_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  status public.queue_status not null default 'pendente',
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (direction, event_id)
);
create index crm_events_status_idx on public.crm_events(status, next_attempt_at);

-- Mensagens WhatsApp ------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null,
  provider_template_name text,
  language text not null default 'pt_BR',
  body_preview text,
  is_approved boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, event_key, language)
);

create table public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  sac_ticket_id uuid references public.sac_tickets(id) on delete set null,
  event_key text not null,
  template_id uuid references public.message_templates(id) on delete set null,
  dedupe_key text not null unique,
  status public.queue_status not null default 'pendente',
  external_id text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_outbox_status_idx on public.message_outbox(status, scheduled_for);

-- Integrações e auditoria (credenciais NUNCA aqui; só o NOME do secret) --
create table public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  is_enabled boolean not null default false,
  base_url text,
  secret_name text,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table public.integration_event_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  direction text not null,
  endpoint text,
  status_code integer,
  request jsonb,
  response jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index integration_event_logs_provider_idx on public.integration_event_logs(provider, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_logs_table_idx on public.audit_logs(table_name, created_at desc);

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), tg_op, tg_table_name,
          case when tg_op = 'DELETE' then old.id else new.id end,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create table public.public_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Triggers --------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations','units','user_profiles','user_unit_access','customers','customer_consents',
    'reservation_capacity_rules','reservation_blocks','reservations','reservation_status_history','sac_tickets',
    'sac_ticket_events','crm_contacts','crm_conversations','crm_events','message_templates','message_outbox',
    'integration_settings','integration_event_logs','audit_logs']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
  foreach t in array array['units','user_roles','user_unit_access','reservations','reservation_capacity_rules','reservation_blocks','sac_tickets','integration_settings']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

create trigger reservations_status_log_ins after insert on public.reservations
for each row execute function public.log_reservation_status();
create trigger reservations_status_log_upd before update on public.reservations
for each row execute function public.log_reservation_status();

-- GRANTS + RLS (anon NÃO acessa tabelas; só as RPCs públicas abaixo) ------
grant usage on schema public to anon, authenticated, service_role;
do $$
declare t text;
begin
  foreach t in array array['organizations','units','user_profiles','user_roles','user_unit_access','customers','customer_consents',
    'reservation_capacity_rules','reservation_blocks','reservations','reservation_status_history','sac_tickets',
    'sac_ticket_events','crm_contacts','crm_conversations','crm_events','message_templates','message_outbox',
    'integration_settings','integration_event_logs','audit_logs']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
grant all on public.public_rate_limits to service_role;
alter table public.public_rate_limits enable row level security;

-- organizations
create policy "staff lê organização" on public.organizations for select to authenticated using (public.is_staff(auth.uid()));
create policy "super admin gerencia organização" on public.organizations for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- units
create policy "staff lê unidades autorizadas" on public.units for select to authenticated using (public.can_access_unit(auth.uid(), id));
create policy "super admin cria unidades" on public.units for insert to authenticated with check (public.has_role(auth.uid(),'super_admin'));
create policy "gestor edita unidades autorizadas" on public.units for update to authenticated
  using (public.can_manage_unit(auth.uid(), id)) with check (public.can_manage_unit(auth.uid(), id));
create policy "super admin remove unidades" on public.units for delete to authenticated using (public.has_role(auth.uid(),'super_admin'));

-- user_profiles
create policy "lê perfis permitidos" on public.user_profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'super_admin')
         or (public.has_role(auth.uid(),'gestor') and exists (
              select 1 from public.user_unit_access a where a.user_id = user_profiles.id and public.can_manage_unit(auth.uid(), a.unit_id))));
create policy "edita próprio perfil" on public.user_profiles for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'super_admin'))
  with check (id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "super admin cria perfis" on public.user_profiles for insert to authenticated with check (public.has_role(auth.uid(),'super_admin'));
create policy "super admin remove perfis" on public.user_profiles for delete to authenticated using (public.has_role(auth.uid(),'super_admin'));

-- user_roles
create policy "lê próprios papéis" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "super admin gerencia papéis" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- user_unit_access
create policy "lê acessos" on public.user_unit_access for select to authenticated
  using (user_id = auth.uid() or public.can_manage_unit(auth.uid(), unit_id));
create policy "super admin gerencia acessos" on public.user_unit_access for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- customers
create policy "staff lê clientes de suas unidades" on public.customers for select to authenticated
  using (public.has_role(auth.uid(),'super_admin')
    or exists (select 1 from public.reservations r where r.customer_id = customers.id and public.can_access_unit(auth.uid(), r.unit_id))
    or exists (select 1 from public.sac_tickets s where s.customer_id = customers.id and s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id)));
create policy "staff cria clientes" on public.customers for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "staff edita clientes de suas unidades" on public.customers for update to authenticated
  using (public.has_role(auth.uid(),'super_admin')
    or exists (select 1 from public.reservations r where r.customer_id = customers.id and public.can_access_unit(auth.uid(), r.unit_id)))
  with check (public.is_staff(auth.uid()));
create policy "super admin remove clientes" on public.customers for delete to authenticated using (public.has_role(auth.uid(),'super_admin'));

create policy "super admin consentimentos" on public.customer_consents for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- capacidade / bloqueios
create policy "staff lê regras" on public.reservation_capacity_rules for select to authenticated using (public.can_access_unit(auth.uid(), unit_id));
create policy "gestor gerencia regras" on public.reservation_capacity_rules for all to authenticated
  using (public.can_manage_unit(auth.uid(), unit_id)) with check (public.can_manage_unit(auth.uid(), unit_id));
create policy "staff lê bloqueios" on public.reservation_blocks for select to authenticated using (public.can_access_unit(auth.uid(), unit_id));
create policy "gestor gerencia bloqueios" on public.reservation_blocks for all to authenticated
  using (public.can_manage_unit(auth.uid(), unit_id)) with check (public.can_manage_unit(auth.uid(), unit_id));

-- reservas
create policy "staff lê reservas da unidade" on public.reservations for select to authenticated using (public.can_access_unit(auth.uid(), unit_id));
create policy "staff cria reservas na unidade" on public.reservations for insert to authenticated with check (public.can_access_unit(auth.uid(), unit_id));
create policy "staff atualiza reservas da unidade" on public.reservations for update to authenticated
  using (public.can_access_unit(auth.uid(), unit_id)) with check (public.can_access_unit(auth.uid(), unit_id));
create policy "super admin remove reservas" on public.reservations for delete to authenticated using (public.has_role(auth.uid(),'super_admin'));
create policy "staff lê histórico" on public.reservation_status_history for select to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id and public.can_access_unit(auth.uid(), r.unit_id)));
create policy "staff registra observação" on public.reservation_status_history for insert to authenticated
  with check (exists (select 1 from public.reservations r where r.id = reservation_id and public.can_access_unit(auth.uid(), r.unit_id)));

-- SAC
create policy "staff lê SAC" on public.sac_tickets for select to authenticated
  using (public.has_role(auth.uid(),'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)) or assigned_to = auth.uid());
create policy "staff cria SAC" on public.sac_tickets for insert to authenticated
  with check (public.has_role(auth.uid(),'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)));
create policy "staff atualiza SAC" on public.sac_tickets for update to authenticated
  using (public.has_role(auth.uid(),'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)) or assigned_to = auth.uid())
  with check (public.has_role(auth.uid(),'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)) or assigned_to = auth.uid());
create policy "staff lê eventos SAC" on public.sac_ticket_events for select to authenticated
  using (exists (select 1 from public.sac_tickets s where s.id = ticket_id and (public.has_role(auth.uid(),'super_admin') or (s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id)) or s.assigned_to = auth.uid())));
create policy "staff cria eventos SAC" on public.sac_ticket_events for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.sac_tickets s where s.id = ticket_id and (public.has_role(auth.uid(),'super_admin') or (s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id)) or s.assigned_to = auth.uid())));

-- CRM / mensagens / integrações
create policy "gestor lê contatos CRM" on public.crm_contacts for select to authenticated using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'gestor'));
create policy "super admin CRM contatos" on public.crm_contacts for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "gestor lê conversas" on public.crm_conversations for select to authenticated
  using (public.has_role(auth.uid(),'super_admin') or (unit_id is not null and public.can_manage_unit(auth.uid(), unit_id)));
create policy "super admin conversas" on public.crm_conversations for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "super admin eventos CRM" on public.crm_events for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "gestor lê templates" on public.message_templates for select to authenticated using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'gestor'));
create policy "super admin templates" on public.message_templates for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "staff lê mensagens da unidade" on public.message_outbox for select to authenticated
  using (public.has_role(auth.uid(),'super_admin') or exists (select 1 from public.reservations r where r.id = reservation_id and public.can_access_unit(auth.uid(), r.unit_id)));
create policy "super admin mensagens" on public.message_outbox for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "super admin integrações" on public.integration_settings for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "super admin logs integração" on public.integration_event_logs for select to authenticated using (public.has_role(auth.uid(),'super_admin'));
create policy "super admin auditoria" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'super_admin'));

-- =====================================================================
-- DISPONIBILIDADE E RESERVA PÚBLICA
-- =====================================================================
create or replace function public.normalize_br_phone(_raw text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(_raw,''), '\D', '', 'g');
begin
  if length(d) in (10, 11) then d := '55' || d; end if;
  if d !~ '^55[1-9][0-9](9[0-9]{8}|[2-8][0-9]{7})$' then return null; end if;
  return d;
end $$;

create or replace function public.public_list_units()
returns table (id uuid, name text, slug text, address text, city text, description text, photo_url text,
               large_group_threshold integer, max_advance_days integer)
language sql stable security definer set search_path = public as $$
  select u.id, u.name, u.slug, u.address, u.city, u.description, u.photo_url, u.large_group_threshold, u.max_advance_days
  from public.units u
  where u.is_active and u.accepts_online_reservations
  order by u.sort_order, u.name
$$;

create or replace function public.get_unit_slots(_unit_id uuid, _date date, _party_size integer default 1)
returns table (slot_time time, remaining integer, available boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  u public.units;
  now_sp timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  select * into u from public.units where id = _unit_id and is_active and accepts_online_reservations;
  if not found then return; end if;
  if _date < now_sp::date or _date > now_sp::date + u.max_advance_days then return; end if;
  if exists (select 1 from public.reservation_blocks b where b.unit_id = _unit_id and b.block_date = _date and b.start_time is null) then return; end if;

  return query
  with rules as (
    select r.* from public.reservation_capacity_rules r
    where r.unit_id = _unit_id and r.is_active and r.weekday = extract(dow from _date)::int
  ), slots as (
    select distinct on (gs::time) gs::time as t, r.max_guests_per_slot as cap, r.max_party_size as maxp
    from rules r,
      generate_series(_date + r.start_time, _date + r.end_time - make_interval(mins => r.slot_interval_minutes),
                      make_interval(mins => r.slot_interval_minutes)) gs
    order by gs::time, r.max_guests_per_slot desc
  ), occ as (
    select res.reservation_time as t, sum(res.party_size)::int as used
    from public.reservations res
    where res.unit_id = _unit_id and res.reservation_date = _date and res.status in ('pendente','confirmada')
    group by res.reservation_time
  )
  select s.t, greatest(s.cap - coalesce(o.used,0), 0)::int,
         (s.cap - coalesce(o.used,0) >= greatest(_party_size,1) and greatest(_party_size,1) <= s.maxp)
  from slots s
  left join occ o on o.t = s.t
  where (_date + s.t) >= now_sp + make_interval(mins => u.min_advance_minutes)
    and not exists (select 1 from public.reservation_blocks b
                    where b.unit_id = _unit_id and b.block_date = _date and b.start_time is not null
                      and s.t >= b.start_time and s.t < b.end_time)
  order by s.t;
end $$;

create or replace function public.get_unit_available_dates(_unit_id uuid, _from date, _to date, _party_size integer default 1)
returns table (available_date date)
language sql stable security definer set search_path = public as $$
  select d::date from generate_series(_from, least(_to, _from + 120), interval '1 day') d
  where exists (select 1 from public.get_unit_slots(_unit_id, d::date, _party_size) s where s.available)
$$;

create or replace function public.hit_rate_limit(_key text, _max integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare w timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 10) * interval '10 min';
        n integer;
begin
  insert into public.public_rate_limits(key, window_start, hits) values (_key, w, 1)
  on conflict (key, window_start) do update set hits = public_rate_limits.hits + 1
  returning hits into n;
  delete from public.public_rate_limits where window_start < now() - interval '1 day';
  return n <= _max;
end $$;

create or replace function public.create_public_reservation(
  _unit_id uuid, _date date, _time time, _party_size integer,
  _full_name text, _phone text, _notes text default null,
  _privacy_accepted boolean default false, _whatsapp_opt_in boolean default false,
  _website text default null -- honeypot
)
returns table (protocol text, status public.reservation_status, unit_name text,
               reservation_date date, reservation_time time, party_size integer, is_large_group boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  u public.units;
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_notes text := nullif(btrim(coalesce(_notes,'')), '');
  v_ip text := coalesce(nullif(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1), ''), 'na');
  v_customer uuid;
  v_status public.reservation_status;
  v_large boolean;
  v_protocol text;
  v_ok boolean;
  v_res uuid;
begin
  if coalesce(_website,'') <> '' then raise exception 'SPAM_DETECTED'; end if;
  if not coalesce(_privacy_accepted,false) then raise exception 'PRIVACY_REQUIRED'; end if;
  if length(v_name) < 3 or length(v_name) > 120 or v_name !~ '\s' then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if _party_size is null or _party_size < 1 or _party_size > 200 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'NOTES_TOO_LONG'; end if;
  if not public.hit_rate_limit('ip:' || v_ip, 20) or not public.hit_rate_limit('phone:' || v_phone, 5) then
    raise exception 'RATE_LIMITED';
  end if;

  select * into u from public.units where id = _unit_id and is_active and accepts_online_reservations;
  if not found then raise exception 'UNIT_UNAVAILABLE'; end if;

  -- lock transacional por unidade+data+horário
  perform pg_advisory_xact_lock(hashtextextended(_unit_id::text || _date::text || _time::text, 0));

  select s.available into v_ok from public.get_unit_slots(_unit_id, _date, _party_size) s where s.slot_time = _time;
  if v_ok is distinct from true then raise exception 'SLOT_UNAVAILABLE'; end if;

  v_large := _party_size > u.large_group_threshold;
  v_status := case when u.auto_confirm and not v_large then 'confirmada' else 'pendente' end;

  insert into public.customers (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (u.organization_id, v_name, v_phone, coalesce(_whatsapp_opt_in,false))
  on conflict (organization_id, phone_e164) do update
    set full_name = excluded.full_name,
        whatsapp_opt_in = customers.whatsapp_opt_in or excluded.whatsapp_opt_in
  returning id into v_customer;

  insert into public.customer_consents (customer_id, consent_type, granted, source, policy_version)
  values (v_customer, 'privacy_notice', true, 'landing_page', '2026-10');
  if _whatsapp_opt_in then
    insert into public.customer_consents (customer_id, consent_type, granted, source, policy_version)
    values (v_customer, 'whatsapp_transactional', true, 'landing_page', '2026-10');
  end if;

  loop
    v_protocol := 'CAD-' || to_char(_date, 'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 5));
    exit when not exists (select 1 from public.reservations r where r.protocol = v_protocol);
  end loop;

  insert into public.reservations (protocol, organization_id, unit_id, customer_id, reservation_date, reservation_time,
                                   party_size, notes, origin, status, is_large_group, confirmed_at)
  values (v_protocol, u.organization_id, _unit_id, v_customer, _date, _time, _party_size, v_notes,
          'landing_page', v_status, v_large, case when v_status = 'confirmada' then now() end)
  returning id into v_res;

  -- evento para o Tryade CRM (processado na Fase 6)
  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (u.organization_id, 'outbound', 'reservation.created:' || v_res, 'reservation.created',
          jsonb_build_object('reservation_id', v_res, 'protocol', v_protocol, 'unit_id', _unit_id,
                             'date', _date, 'time', _time, 'party_size', _party_size, 'status', v_status,
                             'origin', 'landing_page', 'phone', v_phone));

  -- WhatsApp enfileirado somente com consentimento (envio real na Fase 7)
  if _whatsapp_opt_in then
    insert into public.message_outbox (organization_id, customer_id, reservation_id, event_key, dedupe_key)
    values (u.organization_id, v_customer, v_res,
            case when v_status = 'confirmada' then 'reserva_confirmada' else 'reserva_solicitada' end,
            'reservation:' || v_res || ':' || v_status);
  end if;

  return query select v_protocol, v_status, u.name, _date, _time, _party_size, v_large;
end $$;

revoke all on function public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text) from public;
revoke all on function public.hit_rate_limit(text,integer) from public, anon, authenticated;
grant execute on function public.public_list_units() to anon, authenticated;
grant execute on function public.get_unit_slots(uuid,date,integer) to anon, authenticated;
grant execute on function public.get_unit_available_dates(uuid,date,date,integer) to anon, authenticated;
grant execute on function public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text) to anon, authenticated;

-- Dados iniciais ----------------------------------------------------------
insert into public.organizations (name, slug) values ('Rede Cadeeiro', 'rede-cadeeiro');

-- PRIMEIRO SUPER ADMIN: depois de criar sua conta em /entrar, rode:
--   insert into public.user_roles (user_id, role)
--     select id, 'super_admin' from auth.users where email = 'SEU_EMAIL';
--   update public.user_profiles set organization_id = (select id from public.organizations where slug = 'rede-cadeeiro')
--     where id = (select id from auth.users where email = 'SEU_EMAIL');
