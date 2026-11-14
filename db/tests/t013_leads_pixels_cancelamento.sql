-- Cenários da migração 013 (por cima da 012 do Lovable): lead do WhatsApp ligado ao cliente e à campanha,
-- ticket médio do quilo, pixels da Meta e aviso de cancelamento com motivo. Cada bloco usa ASSERT.
select id as org from organizations limit 1 \gset
begin;
-- seed
insert into units(id,organization_id,name,slug,city,services) values
 ('00000000-0000-0000-0000-0000000000a1',:'org','Candeeiro Goiânia','goiania','Goiânia','{almoco_quilo,rodizio_pizza}'),
 ('00000000-0000-0000-0000-0000000000a2',:'org','Candeeiro Anápolis','anapolis','Anápolis','{rodizio_carnes,rodizio_pizza}');
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000b1','gestor@x.com'),('00000000-0000-0000-0000-0000000000b2','func@x.com');
update user_profiles set organization_id=:'org', full_name='Gestora', is_active=true where id='00000000-0000-0000-0000-0000000000b1';
update user_profiles set organization_id=:'org', full_name='Func Anapolis', is_active=true where id='00000000-0000-0000-0000-0000000000b2';
delete from user_roles where user_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
insert into user_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000b1','gestor'),('00000000-0000-0000-0000-0000000000b2','funcionario');
insert into user_unit_access(user_id,unit_id) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2');
-- cliente que já pediu para não receber marketing
insert into customers(organization_id,full_name,phone_e164,whatsapp_opt_in) values (:'org','Bia Antiga','5562988880000',false);

-- T1) anon captura pelo botão (RPC da 012): lead + cliente com aceite + campanha normalizada
set local role anon;
select public.capture_whatsapp_lead('Ana Souza','(62) 99999-1111','goiania','/c/black-friday',true,'','ig','cpc','Black-Friday','vid1','fb123');
select public.capture_whatsapp_lead('Bia Antiga','62988880000','anapolis','/',true,'',null,null,'promo!!',null,null);
reset role;
do $$ declare l record; c record; begin
  select * into l from whatsapp_leads where full_name='Ana Souza';
  assert l.campaign = 'black-friday', 'T1 campanha: ' || coalesce(l.campaign,'(nulo)');
  assert l.customer_id is not null, 'T1 lead ligado ao cliente';
  select * into c from customers where id = l.customer_id;
  assert c.whatsapp_opt_in and c.phone_e164 = '5562999991111', 'T1 cliente novo com aceite';
  select * into l from whatsapp_leads where full_name='Bia Antiga';
  assert l.campaign is null, 'T1b campanha inválida some: ' || coalesce(l.campaign,'(nulo)');
  select * into c from customers where id = l.customer_id;
  assert c.full_name = 'Bia Antiga' and not c.whatsapp_opt_in, 'T1c quem saiu do marketing continua fora';
  assert (select count(*) from customers where phone_e164 = '5562988880000') = 1, 'T1d não duplica cliente';
end $$;

-- T2) staff: funcionário de Anápolis só vê lead de Anápolis; anon não lê
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from whatsapp_leads) = 1, 'T2 func anapolis vê só o da cidade';
  assert (select city from whatsapp_leads) = 'anapolis', 'T2 cidade';
end $$;
reset role;
do $$ begin
  begin set local role anon; perform 1 from whatsapp_leads; reset role; raise exception 'T2b anon leu leads';
  exception when insufficient_privilege then reset role; end;
end $$;

-- T3) ticket médio do quilo: só gestor
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.site_settings_save(42.5);
reset role;
do $$ begin
  assert (select quilo_avg_ticket from site_settings) = 42.5, 'T3 ticket salvo';
  begin set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
    perform public.site_settings_save(10); reset role; raise exception 'T3b funcionário salvou';
  exception when others then reset role; assert sqlerrm like '%FORBIDDEN%', 'T3b ' || sqlerrm; end;
  begin set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
    perform public.site_settings_save(5000); reset role; raise exception 'T3c valor absurdo aceito';
  exception when others then reset role; assert sqlerrm like '%INVALID_TICKET%', 'T3c ' || sqlerrm; end;
  begin set local role anon; perform public.site_settings_save(1); reset role; raise exception 'T3d anon salvou';
  exception when insufficient_privilege then reset role; end;
end $$;

-- T4) pixels: gestor salva; anon só lê a lista pública; duplicado e funcionário bloqueados
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.pixel_save(null,'Global','111111111','global');
select public.pixel_save(null,'Anapolis','222222222','anapolis');
select public.pixel_save(null,'BF','333333333','campanha','black-friday');
reset role;
set local role anon;
do $$ begin
  assert public.public_pixels() = array['111111111'], 'T4 sem filtro: ' || public.public_pixels()::text;
  assert public.public_pixels('anapolis', null) = array['111111111','222222222'], 'T4 anapolis';
  assert public.public_pixels('goiania', 'black-friday') = array['111111111','333333333'], 'T4 goiania+campanha';
end $$;
reset role;
do $$ begin
  begin set local role authenticated; set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
    perform public.pixel_save(null,'Dup','111111111','global'); reset role; raise exception 'T4b duplicado aceito';
  exception when others then reset role; assert sqlerrm like '%DUPLICATE_PIXEL%', 'T4b ' || sqlerrm; end;
  begin set local role authenticated; set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b2';
    perform public.pixel_save(null,'p','123456789','global'); reset role; raise exception 'T4c funcionário salvou pixel';
  exception when others then reset role; assert sqlerrm like '%FORBIDDEN%', 'T4c ' || sqlerrm; end;
  begin set local role anon; perform public.pixel_save(null,'x','123456','global'); reset role; raise exception 'T4d anon salvou pixel';
  exception when insufficient_privilege then reset role; end;
end $$;

-- T5) reserva do mesmo cliente vira lead "convertido"
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service)
 select '00000000-0000-0000-0000-0000000000c1','CAND-T1',organization_id,'00000000-0000-0000-0000-0000000000a1',id,current_date+3,'12:00',4,'landing_page','pendente','rodizio_pizza' from customers where full_name='Ana Souza';
do $$ declare l record; begin
  select * into l from whatsapp_leads where full_name='Ana Souza';
  assert l.status = 'convertido' and l.reservation_id = '00000000-0000-0000-0000-0000000000c1', 'T5 lead convertido: ' || l.status;
end $$;

-- T6) cancelamento com motivo avisa o cliente (recusar pendente no painel também)
insert into app_private_config(key,value) values ('n8n_confirmacao_url','http://n8n.local/hook'),('n8n_confirmacao_segredo','segredo-teste');
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service)
 select '00000000-0000-0000-0000-0000000000c2','CAND-T2',organization_id,'00000000-0000-0000-0000-0000000000a1',id,current_date+3,'13:00',2,'landing_page','pendente','rodizio_pizza' from customers where full_name='Ana Souza';
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service)
 select '00000000-0000-0000-0000-0000000000c3','CAND-T3',organization_id,'00000000-0000-0000-0000-0000000000a1',id,current_date+3,'14:00',2,'landing_page','pendente','rodizio_pizza' from customers where full_name='Ana Souza';
-- c1 (pendente) recusada pelo painel COM motivo
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select count(*) from set_reservation_status('00000000-0000-0000-0000-0000000000c1','cancelada','Estamos lotados nesse horário');
reset role;
-- c2 (pendente) cancelada pelo SDR (sem uid): NÃO avisa
select set_config('request.jwt.claim.sub','',true);
update reservations set status='cancelada' where id='00000000-0000-0000-0000-0000000000c2';
-- c3 confirmada pelo painel e cancelada pelo SDR: avisa (confirmada -> cancelada, como antes)
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select count(*) from set_reservation_status('00000000-0000-0000-0000-0000000000c3','confirmada',null);
reset role; select set_config('request.jwt.claim.sub','',true);
update reservations set status='cancelada' where id='00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select count(*) from message_outbox where event_key='reserva_cancelada' and reservation_id='00000000-0000-0000-0000-0000000000c1') = 1, 'T6a recusa no painel avisa';
  assert (select count(*) from message_outbox where reservation_id='00000000-0000-0000-0000-0000000000c2') = 0, 'T6b cancelamento do SDR em pendente não avisa';
  assert (select count(*) from message_outbox where event_key='reserva_cancelada' and reservation_id='00000000-0000-0000-0000-0000000000c3') = 1, 'T6c confirmada cancelada avisa';
end $$;
select public.dispatch_reservation_confirmations();
do $$ declare p1 record; p3 record; begin
  select body, headers into p1 from net._sent where body->>'protocol' = 'CAND-T1' and body->>'status' = 'cancelada' order by id desc limit 1;
  select body, headers into p3 from net._sent where body->>'protocol' = 'CAND-T3' and body->>'status' = 'cancelada' order by id desc limit 1;
  assert p1.body->>'reason' = 'Estamos lotados nesse horário', 'T6d motivo no payload: ' || coalesce(p1.body->>'reason','(nulo)');
  assert p1.body->>'previous_status' = 'pendente', 'T6e anterior pendente';
  assert p3.body->>'previous_status' = 'confirmada', 'T6f anterior confirmada';
  assert p1.headers->>'x-candeeiro-segredo' = 'segredo-teste', 'T6g segredo no cabeçalho';
end $$;
rollback;
select 'ok t013' as resultado;
