-- Ajustes pedidos pelo dono depois da primeira validacao do atendente (ja aplicados no banco ao vivo).
-- Idempotente: pode rodar de novo sem duplicar nada.

-- Delivery so em Goiania; as duas unidades confirmam reserva automaticamente.
update units set has_delivery = (slug = 'goiania'), auto_confirm = true, updated_at = now()
where slug in ('goiania', 'anapolis');

-- Ultima reserva do jantar as 20:30 (o fim do turno e exclusivo: 21:00 gera o ultimo horario 20:30).
update reservation_capacity_rules set end_time = '21:00', shift_label = 'Jantar', updated_at = now()
where unit_id in (select id from units where slug in ('goiania', 'anapolis')) and shift_label like 'Jantar%';
update reservation_capacity_rules set shift_label = 'Almoço', updated_at = now()
where unit_id in (select id from units where slug in ('goiania', 'anapolis')) and shift_label like 'Almoço%';

-- Almoco no quilo de Anapolis: mesmo valor todos os dias, inclusive feriados (tabela do mes e padrao).
update price_rules set weekdays = '{0,1,2,3,4,5,6}', on_holidays = true
where service = 'almoco_quilo'
  and table_id in (select t.id from price_tables t join units u on u.id = t.unit_id
                   where u.slug = 'anapolis' and t.name like 'Tabela do mês%');
insert into price_rules (table_id, service, weekdays, on_holidays, amount, sort_order)
select t.id, 'almoco_quilo', '{0,1,2,3,4,5,6}', true, 79.90, 1
from price_tables t join units u on u.id = t.unit_id
where u.slug = 'anapolis' and t.name like 'Padrão%'
  and not exists (select 1 from price_rules r where r.table_id = t.id and r.service = 'almoco_quilo');
