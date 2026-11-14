-- Dados (rodar uma vez, direto no banco; não é migration). Pedido do dono em 13/11/2026:
--  * Goiânia: quilo seg–sex R$ 89,90/kg; sáb, dom e feriados R$ 109,90/kg; rodízio de pizza dom–sex R$ 44,90 e sáb R$ 49,90;
--    infantil (rodízio de pizza): 0–5 não paga, 6–10 R$ 34,90, a partir de 11 integral.
--  * Anápolis: valores e política infantil conferidos (já estavam iguais ao informado); almoço a partir das 11h.
--  * As tabelas "do mês (outubro/2026)" venceram em 31/10 e ficam desativadas (o histórico continua na auditoria).
--  * A unidade de exemplo "Unidade Centro" (São Paulo) não existe e é excluída (não tinha reservas, pedidos nem valores).
do $$
declare
  v_gyn uuid := (select id from public.units where slug = 'goiania');
  v_ana uuid := (select id from public.units where slug = 'anapolis');
  v_centro uuid := (select id from public.units where slug = 'centro');
  t_gyn uuid; t_ana uuid; v_notes text;
begin
  select id into t_gyn from public.price_tables where unit_id = v_gyn and valid_from is null and valid_until is null order by created_at limit 1;
  select id into t_ana from public.price_tables where unit_id = v_ana and valid_from is null and valid_until is null order by created_at limit 1;
  if t_gyn is null or t_ana is null then raise exception 'tabela padrão não encontrada'; end if;

  -- Goiânia · tabela padrão
  delete from public.price_rules where table_id = t_gyn;
  insert into public.price_rules (table_id, service, weekdays, on_holidays, amount, sort_order) values
    (t_gyn, 'almoco_quilo',  '{1,2,3,4,5}',   false,  89.90, 10),
    (t_gyn, 'almoco_quilo',  '{6,0}',         true,  109.90, 20),
    (t_gyn, 'rodizio_pizza', '{0,1,2,3,4,5}', false,  44.90, 30),
    (t_gyn, 'rodizio_pizza', '{6}',           false,  49.90, 40);
  insert into public.price_child_policies (table_id, service, free_until_age, child_from_age, child_to_age, child_amount, full_from_age)
  values (t_gyn, 'rodizio_pizza', 5, 6, 10, 34.90, 11)
  on conflict (table_id, service) do update set free_until_age = 5, child_from_age = 6, child_to_age = 10, child_amount = 34.90, full_from_age = 11, updated_at = now();

  -- Anápolis · tabela padrão (regrava para garantir que bate com o informado)
  delete from public.price_rules where table_id = t_ana;
  insert into public.price_rules (table_id, service, weekdays, on_holidays, amount, sort_order) values
    (t_ana, 'almoco_quilo',     '{1,2,3,4,5}',     false, 79.90, 10),
    (t_ana, 'rodizio_carnes',   '{1,2,3,4,5,6}',   false, 79.90, 20),
    (t_ana, 'rodizio_carnes',   '{0}',             false, 89.90, 30),
    (t_ana, 'almoco_executivo', '{0,1,2,3,4,5,6}', false, 49.90, 40),
    (t_ana, 'rodizio_pizza',    '{0,1,2,3,4}',     false, 45.90, 50),
    (t_ana, 'rodizio_pizza',    '{5}',             false, 47.90, 60),
    (t_ana, 'rodizio_pizza',    '{6}',             false, 49.90, 70);
  insert into public.price_child_policies (table_id, service, free_until_age, child_from_age, child_to_age, child_amount, full_from_age) values
    (t_ana, 'rodizio_carnes', 5, 6, 10, 39.90, 11),
    (t_ana, 'rodizio_pizza',  4, 5,  9, 25.90, 10)
  on conflict (table_id, service) do update set free_until_age = excluded.free_until_age, child_from_age = excluded.child_from_age,
    child_to_age = excluded.child_to_age, child_amount = excluded.child_amount, full_from_age = excluded.full_from_age, updated_at = now();

  -- Tabelas do mês vencidas
  update public.price_tables set is_active = false where unit_id in (v_gyn, v_ana) and valid_until < current_date and is_active;

  -- Anápolis · almoço a partir das 11h (o atendente só informa horário que está nas observações da unidade)
  select agent_notes into v_notes from public.units where id = v_ana;
  v_notes := replace(v_notes,
    'Não informe o horário de funcionamento do almoço (não está cadastrado): para saber os horários com vaga use consultar_disponibilidade.',
    'HORÁRIO DO ALMOÇO: o almoço começa às 11h, todos os dias (o quilo é só de segunda a sexta). Para saber os horários com vaga use consultar_disponibilidade.');
  if position('o almoço começa às 11h' in v_notes) = 0 then
    v_notes := v_notes || ' HORÁRIO DO ALMOÇO: o almoço começa às 11h, todos os dias (o quilo é só de segunda a sexta).';
  end if;
  update public.units set agent_notes = v_notes where id = v_ana;

  -- Unidade de exemplo
  if v_centro is not null then
    if exists (select 1 from public.reservations where unit_id = v_centro) or exists (select 1 from public.delivery_orders where unit_id = v_centro) then
      raise exception 'Unidade Centro tem reservas ou pedidos: não excluída';
    end if;
    delete from public.units where id = v_centro;
    perform public.write_audit('sistema', 'unidade.excluida', 'unit', v_centro, null,
      jsonb_build_object('name', 'Unidade Centro', 'slug', 'centro'), null, 'Unidade de exemplo excluída a pedido do dono (não existe).');
  end if;
end $$;
