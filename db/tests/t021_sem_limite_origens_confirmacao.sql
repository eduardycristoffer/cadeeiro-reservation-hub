-- Cenários da migração 021: sem limite de quantidade, novas origens e confirmação no WhatsApp ao criar pelo painel.
\set ON_ERROR_STOP on
select id as org from organizations limit 1 \gset
begin;
insert into units(id,organization_id,name,slug,city,services,accepts_online_reservations) values
 ('00000000-0000-0000-0000-0000000000a1',:'org','Candeeiro Goiânia','goiania','Goiânia','{almoco_quilo,rodizio_pizza}',true);
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000b1','gestor@x.com');
update user_profiles set organization_id=:'org', is_active=true where id='00000000-0000-0000-0000-0000000000b1';
delete from user_roles where user_id='00000000-0000-0000-0000-0000000000b1';
insert into user_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000b1','gestor');
insert into user_unit_access(user_id,unit_id) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1');
-- capacidade BAIXA de propósito: 4 pessoas por horário e no máximo 4 por grupo
insert into reservation_capacity_rules(unit_id,weekday,start_time,end_time,slot_interval_minutes,max_guests_per_slot,max_party_size)
select '00000000-0000-0000-0000-0000000000a1', d, '11:00','15:00',30,4,4 from generate_series(0,6) d;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select ((now() at time zone 'America/Sao_Paulo')::date + 3) as dia \gset
select set_config('t.dia', :'dia', false);

-- T1: horário continua existindo e fica disponível para grupo bem acima da capacidade
do $$ begin
  assert (select count(*) from public.staff_unit_slots('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, 60) where available) = 8, 'T1 staff: 8 horários disponíveis';
  assert (select count(*) from public.get_unit_slots('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, 60) where available) = 8, 'T1 público: 8 horários disponíveis';
  raise notice 'T1 ok: grupo de 60 vê todos os horários';
end $$;

-- T2: criar várias reservas no mesmo horário, muito além da capacidade de 4
do $$ declare r record; i int; begin
  for i in 1..6 loop
    select * into r from public.create_staff_reservation('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, '12:00', 30, 'Cliente ' || i, '62999' || lpad(i::text, 6, '0'), null, 'telefone', 'pendente');
  end loop;
  assert (select sum(party_size) from reservations where reservation_time = '12:00' and reservation_date = current_setting('t.dia')::date) = 180, 'T2 soma 180';
  raise notice 'T2 ok: 180 pessoas no mesmo horário, sem barrar';
end $$;

-- T3: horário que não existe continua inválido; bloqueio continua valendo
do $$ begin
  begin perform public.create_staff_reservation('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, '19:00', 2, 'Fora', '(62) 99911-0000', null, 'telefone', 'pendente'); assert false, 'T3 horário inexistente aceito';
  exception when others then assert sqlerrm like '%SLOT_UNAVAILABLE%', 'T3 erro esperado: ' || sqlerrm; end;
  insert into reservation_blocks(unit_id, block_date, start_time, end_time, kind) values ('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, '13:00', '14:00', 'manual');
  assert (select count(*) from public.staff_unit_slots('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, 2) where slot_time = '13:00' ) = 0, 'T3 bloqueio ignorado';
  raise notice 'T3 ok: horário inexistente e bloqueio seguem valendo';
end $$;

-- T4: reserva criada já confirmada pelo painel enfileira a confirmação; pendente não
do $$ declare r record; begin
  select * into r from public.create_staff_reservation('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, '12:30', 2, 'Maria Confirmada', '(62) 99922-1111', null, 'whatsapp', 'confirmada');
  assert r.status = 'confirmada', 'T4 status';
  assert (select count(*) from message_outbox where reservation_id = r.id and event_key = 'reserva_confirmada' and status = 'pendente') = 1, 'T4 confirmação enfileirada';
  select * into r from public.create_staff_reservation('00000000-0000-0000-0000-0000000000a1', current_setting('t.dia')::date, '12:30', 2, 'Joao Pendente', '(62) 99922-2222', null, 'instagram', 'pendente');
  assert (select count(*) from message_outbox where reservation_id = r.id) = 0, 'T4 pendente não avisa';
  perform public.set_reservation_status(r.id, 'confirmada', null);
  assert (select count(*) from message_outbox where reservation_id = r.id and event_key = 'reserva_confirmada') = 1, 'T4 confirmar depois avisa (uma vez)';
  perform public.set_reservation_status(r.id, 'cancelada', 'teste');
  raise notice 'T4 ok: confirmação no WhatsApp ao criar confirmada';
end $$;

-- T5: reserva do site (sem usuário logado) não dispara a confirmação extra
do $$ declare cid uuid; begin
  perform set_config('request.jwt.claim.sub', '', true);
  insert into customers(organization_id, full_name, phone_e164, whatsapp_opt_in) values ((select o.id from organizations o limit 1), 'Site Silva', '5562988880001', true) returning customers.id into cid;
  insert into reservations(protocol, organization_id, unit_id, customer_id, reservation_date, reservation_time, party_size, origin, status, confirmed_at)
  values ('CAD-T021-SITE', (select o.id from organizations o limit 1), '00000000-0000-0000-0000-0000000000a1', cid, current_setting('t.dia')::date, '11:00', 2, 'landing_page', 'confirmada', now());
  assert (select count(*) from message_outbox o join reservations r on r.id = o.reservation_id where r.protocol = 'CAD-T021-SITE') = 0, 'T5 site não duplica aviso';
  raise notice 'T5 ok: reserva do site não gera aviso extra';
end $$;

-- T6: novas origens existem
do $$ begin
  assert (select count(*) from unnest(enum_range(null::public.reservation_origin)) v where v::text in ('whatsapp','presencial','instagram','google','indicacao')) = 5, 'T6 origens';
  raise notice 'T6 ok';
end $$;
rollback;
