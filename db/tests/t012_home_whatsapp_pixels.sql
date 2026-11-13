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

-- 1) anon: sem número configurado => lead salvo, whatsapp null
set local role anon;
select 'T1 anon sem numero' t, public.capture_whatsapp_lead('Ana Souza','(62) 99999-1111','goiania','black-friday','fab','{"utm_source":"ig"}','/','true','') r;
select 'T1b public_site_config' t, public.public_site_config() r;
reset role;
select 'T1c lead gravado' t, city, full_name, phone_e164, campaign, status, clicks from whatsapp_leads;
select 'T1d customer criado' t, full_name, whatsapp_opt_in from customers;

-- 2) gestor configura numeros
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.site_settings_save('(62) 99839-6558', '(62) 98888-2222', null, 42.5);
reset role;
select 'T2 settings' t, whatsapp_goiania, whatsapp_anapolis from site_settings;

-- 3) anon com numero: devolve wa e mensagem; duplicado soma clique
set local role anon;
select 'T3a' t, public.capture_whatsapp_lead('Ana Souza','62999991111','goiania',null,'fab',null,'/','true','') r;
select 'T3b anapolis' t, public.capture_whatsapp_lead('Bia','62988880000','anapolis',null,'home',null,null,'true','') r;
select 'T3c ready' t, public.public_site_config() r;
reset role;
select 'T3d leads' t, city, full_name, clicks, source from whatsapp_leads order by created_at;

-- 4) validacoes (cada uma deve falhar)
do $$ declare c text; begin
  foreach c in array array['spam','privacy','phone','city','name'] loop
    begin
      set local role anon;
      if c='spam' then perform public.capture_whatsapp_lead('Ana','62999990000','goiania',null,'fab',null,null,true,'http://x'); end if;
      if c='privacy' then perform public.capture_whatsapp_lead('Ana','62999990000','goiania',null,'fab',null,null,false,''); end if;
      if c='phone' then perform public.capture_whatsapp_lead('Ana','123','goiania',null,'fab',null,null,true,''); end if;
      if c='city' then perform public.capture_whatsapp_lead('Ana','62999990000','curitiba',null,'fab',null,null,true,''); end if;
      if c='name' then perform public.capture_whatsapp_lead('A','62999990000','goiania',null,'fab',null,null,true,''); end if;
      reset role; raise notice 'T4 % NAO FALHOU (ruim)', c;
    exception when others then reset role; raise notice 'T4 % falhou como esperado: %', c, sqlerrm; end;
  end loop;
end $$;

-- 5) anon NAO pode ler/gravar tabelas nem chamar RPC de staff
do $$ begin
  begin set local role anon; perform 1 from whatsapp_leads; reset role; raise notice 'T5a anon leu leads (RUIM)'; exception when others then reset role; raise notice 'T5a ok: %', sqlerrm; end;
  begin set local role anon; perform public.pixel_save(null,'x','123456','global'); reset role; raise notice 'T5b RUIM'; exception when others then reset role; raise notice 'T5b ok: %', sqlerrm; end;
  begin set local role anon; perform public.site_settings_save('1','2'); reset role; raise notice 'T5c RUIM'; exception when others then reset role; raise notice 'T5c ok: %', sqlerrm; end;
end $$;

-- 6) isolamento por unidade: funcionario de Anapolis so ve lead de Anapolis
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select 'T6 func anapolis ve' t, city, full_name from whatsapp_leads;
do $$ begin begin perform public.pixel_save(null,'p','123456789','global'); raise notice 'T6b func salvou pixel (RUIM)'; exception when others then raise notice 'T6b func bloqueado: %', sqlerrm; end; end $$;
reset role;

-- 7) pixels
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.pixel_save(null,'Global','111111111','global');
select public.pixel_save(null,'Anapolis','222222222','anapolis');
select public.pixel_save(null,'BF','333333333','campanha','black-friday');
reset role;
set local role anon;
select 'T7 sem filtro' t, public.public_pixels();
select 'T7 anapolis' t, public.public_pixels('anapolis', null);
select 'T7 goiania+bf' t, public.public_pixels('goiania', 'black-friday');
reset role;
do $$ begin begin set local role authenticated; set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1'; perform public.pixel_save(null,'Dup','111111111','global'); raise notice 'T7b dup RUIM'; exception when others then reset role; raise notice 'T7b dup: %', sqlerrm; end; end $$;

-- 8) reserva vira lead 'reservou'
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service)
 select '00000000-0000-0000-0000-0000000000c1','CAND-T1',organization_id,'00000000-0000-0000-0000-0000000000a1',id,current_date+3,'12:00',4,'landing_page','pendente','rodizio_pizza' from customers where full_name='Ana Souza';
select 'T8 lead apos reserva' t, full_name, status, reservation_id is not null as ligado from whatsapp_leads where city='goiania';

-- 9) cancelamento com motivo
insert into app_private_config(key,value) values ('n8n_confirmacao_url','http://n8n.local/hook'),('n8n_confirmacao_segredo','segredo-teste');
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service)
 select '00000000-0000-0000-0000-0000000000c2','CAND-T2',organization_id,'00000000-0000-0000-0000-0000000000a1',id,current_date+3,'13:00',2,'landing_page','pendente','rodizio_pizza' from customers where full_name='Ana Souza';
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service)
 select '00000000-0000-0000-0000-0000000000c3','CAND-T3',organization_id,'00000000-0000-0000-0000-0000000000a1',id,current_date+3,'14:00',2,'landing_page','pendente','rodizio_pizza' from customers where full_name='Ana Souza';
-- c1 (pendente) recusada pelo painel COM motivo
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T9a set_status c1' t, (select count(*) from set_reservation_status('00000000-0000-0000-0000-0000000000c1','cancelada','Estamos lotados nesse horário')) n;
reset role;
-- c2 (pendente) cancelada pelo SDR (sem uid): NAO avisa
reset role; select set_config('request.jwt.claim.sub','',true);
update reservations set status='cancelada' where id='00000000-0000-0000-0000-0000000000c2';
-- c3 confirmada pelo painel e depois cancelada pelo SDR: avisa (confirmada->cancelada como antes)
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T9b confirmar c3' t, (select count(*) from set_reservation_status('00000000-0000-0000-0000-0000000000c3','confirmada',null)) n;
reset role; select set_config('request.jwt.claim.sub','',true);
update reservations set status='cancelada' where id='00000000-0000-0000-0000-0000000000c3';
select 'T9c outbox' t, r.protocol, o.event_key, o.status from message_outbox o join reservations r on r.id=o.reservation_id order by r.protocol, o.event_key;
-- dispatcher: payload para o n8n
select 'T9d dispatch' t, public.dispatch_reservation_confirmations() n;
select 'T9e payloads' t, body->>'protocol' protocolo, body->>'status' status, body->>'reason' motivo, body->>'previous_status' anterior, headers->>'x-candeeiro-segredo' seg from net._sent order by id;
rollback;
