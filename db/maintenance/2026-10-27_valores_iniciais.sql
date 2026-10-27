-- Dados iniciais do atendente (rodar uma vez, direto no banco; não é migration).
-- Fonte dos valores: tabelas informadas pelo dono em 27/10/2026.
--
-- ATENÇÃO (para o dono revisar no painel depois de rodar):
--  * "Tabela do mês" vale de 01/10/2026 a 31/10/2026; a partir de 01/11 volta a valer a "Padrão".
--    Para estender, edite o período em Painel > Valores.
--  * Os horários de reserva abaixo são PROVISÓRIOS (shift_label "PROVISÓRIO"): ajuste em Painel > Unidades.
--  * has_delivery começa desligado nas duas unidades.
--  * A unidade de exemplo "Unidade Centro" é desativada (as reservas de teste ficam preservadas).

do $$
declare
  v_org uuid := (select id from public.organizations order by created_at limit 1);
  v_gyn uuid; v_ana uuid;
  t_gyn_pad uuid; t_gyn_mes uuid; t_ana_pad uuid; t_ana_mes uuid;
  d smallint;
begin
  -- Unidades --------------------------------------------------------------------------------
  update public.units set is_active = false, accepts_online_reservations = false where slug = 'centro';

  insert into public.units (organization_id, name, slug, city, services, agent_notes, sort_order)
  values (v_org, 'Candeeiro Goiânia', 'goiania', 'Goiânia', array['almoco_quilo', 'rodizio_pizza'],
          'Temos brinquedoteca para as crianças.', 10)
  on conflict (slug) do nothing;
  insert into public.units (organization_id, name, slug, city, services, agent_notes, sort_order)
  values (v_org, 'Candeeiro Anápolis', 'anapolis', 'Anápolis', array['rodizio_carnes', 'almoco_executivo', 'almoco_quilo', 'rodizio_pizza'],
          'Temos brinquedoteca para as crianças.', 20)
  on conflict (slug) do nothing;
  select id into v_gyn from public.units where slug = 'goiania';
  select id into v_ana from public.units where slug = 'anapolis';

  -- Horários de reserva provisórios (almoço e jantar, todos os dias)
  if not exists (select 1 from public.reservation_capacity_rules where unit_id in (v_gyn, v_ana)) then
    for d in 0..6 loop
      insert into public.reservation_capacity_rules (unit_id, weekday, start_time, end_time, slot_interval_minutes, max_guests_per_slot, max_party_size, shift_label)
      select u, d, time '11:00', time '15:00', 30, 40, 30, 'Almoço (PROVISÓRIO)' from unnest(array[v_gyn, v_ana]) u
      union all
      select u, d, time '18:30', time '23:00', 30, 40, 30, 'Jantar (PROVISÓRIO)' from unnest(array[v_gyn, v_ana]) u;
    end loop;
  end if;

  -- Tabelas de valores ------------------------------------------------------------------------
  insert into public.price_tables (unit_id, name, valid_from, valid_until, priority, notes)
  select x.unit_id, x.name, x.valid_from, x.valid_until, x.priority, x.notes
    from (values
      (v_gyn, 'Padrão (divulgação usual)', null::date, null::date, 0, 'Valores que costumamos divulgar.'),
      (v_gyn, 'Tabela do mês (outubro/2026)', date '2026-10-01', date '2026-10-31', 10, 'Tabela usada neste mês.'),
      (v_ana, 'Padrão (divulgação usual)', null::date, null::date, 0, 'Valores que costumamos divulgar.'),
      (v_ana, 'Tabela do mês (outubro/2026)', date '2026-10-01', date '2026-10-31', 10, 'Tabela usada neste mês.')
    ) as x(unit_id, name, valid_from, valid_until, priority, notes)
   where not exists (select 1 from public.price_tables p where p.unit_id = x.unit_id and p.name = x.name);

  select id into t_gyn_pad from public.price_tables where unit_id = v_gyn and name = 'Padrão (divulgação usual)' order by created_at limit 1;
  select id into t_gyn_mes from public.price_tables where unit_id = v_gyn and name = 'Tabela do mês (outubro/2026)' order by created_at limit 1;
  select id into t_ana_pad from public.price_tables where unit_id = v_ana and name = 'Padrão (divulgação usual)' order by created_at limit 1;
  select id into t_ana_mes from public.price_tables where unit_id = v_ana and name = 'Tabela do mês (outubro/2026)' order by created_at limit 1;

  if not exists (select 1 from public.price_rules where table_id in (t_gyn_pad, t_gyn_mes, t_ana_pad, t_ana_mes)) then
    -- Goiânia · padrão
    insert into public.price_rules (table_id, service, weekdays, on_holidays, amount, sort_order) values
      (t_gyn_pad, 'almoco_quilo',   '{1,2,3,4,5}', false, 79.90, 1),
      (t_gyn_pad, 'almoco_quilo',   '{6,0}',       false, 94.90, 2),
      (t_gyn_pad, 'rodizio_pizza',  '{0,1,2,3,4,5}', false, 39.90, 1),
      (t_gyn_pad, 'rodizio_pizza',  '{6}',         false, 49.90, 2);
    insert into public.price_child_policies (table_id, service, free_until_age, child_from_age, child_to_age, child_amount, full_from_age)
      values (t_gyn_pad, 'rodizio_pizza', 5, 6, 10, 29.90, 11);

    -- Goiânia · tabela do mês
    insert into public.price_rules (table_id, service, weekdays, on_holidays, amount, sort_order) values
      (t_gyn_mes, 'almoco_quilo',   '{1,2,3,4,5}', false, 89.90, 1),
      (t_gyn_mes, 'almoco_quilo',   '{6,0}',       true,  109.90, 2),
      (t_gyn_mes, 'rodizio_pizza',  '{1,2,3,4}',   false, 39.90, 1),
      (t_gyn_mes, 'rodizio_pizza',  '{5,0}',       false, 44.90, 2),
      (t_gyn_mes, 'rodizio_pizza',  '{6}',         false, 49.90, 3);
    insert into public.price_child_policies (table_id, service, free_until_age, child_from_age, child_to_age, child_amount, full_from_age)
      values (t_gyn_mes, 'rodizio_pizza', 5, 6, 10, 29.90, 11);

    -- Anápolis · padrão
    insert into public.price_rules (table_id, service, weekdays, on_holidays, amount, sort_order) values
      (t_ana_pad, 'rodizio_carnes',   '{1,2,3,4,5}', false, 59.90, 1),
      (t_ana_pad, 'rodizio_carnes',   '{6}',         false, 69.90, 2),
      (t_ana_pad, 'rodizio_carnes',   '{0}',         false, 79.90, 3),
      (t_ana_pad, 'almoco_executivo', '{0,1,2,3,4,5,6}', false, 39.90, 1),
      (t_ana_pad, 'rodizio_pizza',    '{1,2,3,4}',   false, 39.90, 1),
      (t_ana_pad, 'rodizio_pizza',    '{6}',         false, 47.90, 2),
      (t_ana_pad, 'rodizio_pizza',    '{5,0}',       false, 42.90, 3);
    insert into public.price_child_policies (table_id, service, free_until_age, child_from_age, child_to_age, child_amount, full_from_age) values
      (t_ana_pad, 'rodizio_carnes', 5, 6, 10, 39.90, 11),
      (t_ana_pad, 'rodizio_pizza',  4, 5, 9,  25.90, 10);

    -- Anápolis · tabela do mês
    insert into public.price_rules (table_id, service, weekdays, on_holidays, amount, sort_order) values
      (t_ana_mes, 'almoco_quilo',     '{1,2,3,4,5}', false, 79.90, 1),
      (t_ana_mes, 'rodizio_carnes',   '{1,2,3,4,5,6}', false, 79.90, 1),
      (t_ana_mes, 'rodizio_carnes',   '{0}',         false, 89.90, 2),
      (t_ana_mes, 'almoco_executivo', '{0,1,2,3,4,5,6}', false, 49.90, 1),
      (t_ana_mes, 'rodizio_pizza',    '{0,1,2,3,4}', false, 45.90, 1),
      (t_ana_mes, 'rodizio_pizza',    '{5}',         false, 47.90, 2),
      (t_ana_mes, 'rodizio_pizza',    '{6}',         false, 49.90, 3);
    insert into public.price_child_policies (table_id, service, free_until_age, child_from_age, child_to_age, child_amount, full_from_age) values
      (t_ana_mes, 'rodizio_carnes', 5, 6, 10, 39.90, 11),
      (t_ana_mes, 'rodizio_pizza',  4, 5, 9,  25.90, 10);
  end if;

  -- Feriados nacionais (edite em Painel > Valores)
  insert into public.holidays (organization_id, holiday_date, name) values
    (v_org, '2026-11-02', 'Finados'), (v_org, '2026-11-15', 'Proclamação da República'),
    (v_org, '2026-11-20', 'Consciência Negra'), (v_org, '2026-12-25', 'Natal'),
    (v_org, '2027-01-01', 'Confraternização Universal'), (v_org, '2027-04-02', 'Sexta-feira Santa'),
    (v_org, '2027-04-21', 'Tiradentes'), (v_org, '2027-05-01', 'Dia do Trabalho'),
    (v_org, '2027-06-03', 'Corpus Christi'), (v_org, '2027-09-07', 'Independência do Brasil'),
    (v_org, '2027-10-12', 'Nossa Senhora Aparecida'), (v_org, '2027-11-02', 'Finados'),
    (v_org, '2027-11-15', 'Proclamação da República'), (v_org, '2027-11-20', 'Consciência Negra'),
    (v_org, '2027-12-25', 'Natal')
  on conflict (organization_id, holiday_date) do nothing;
end $$;
