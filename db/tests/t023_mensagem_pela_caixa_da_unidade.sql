-- Cenários da migração 023: a mensagem ao cliente usa a caixa (inbox) da unidade da reserva.
\set ON_ERROR_STOP on
select id as org from organizations limit 1 \gset
begin;
insert into units(id,organization_id,name,slug,city,services,accepts_online_reservations) values
 ('00000000-0000-0000-0000-0000000000a1',:'org','Candeeiro Goiânia','goiania','Goiânia','{almoco_quilo,rodizio_pizza}',true),
 ('00000000-0000-0000-0000-0000000000a2',:'org','Candeeiro Anápolis','anapolis','Anápolis','{almoco_quilo,rodizio_pizza}',true);
insert into crm_inbox_units(organization_id, inbox_external_id, unit_id) values
 (:'org','15:52','00000000-0000-0000-0000-0000000000a1'),(:'org','15:53','00000000-0000-0000-0000-0000000000a2');
insert into app_private_config(key,value) values ('n8n_confirmacao_url','http://n8n.local/hook'),('n8n_confirmacao_segredo','s');
insert into customers(id,organization_id,full_name,phone_e164) values ('00000000-0000-0000-0000-0000000000d1',:'org','Maria Teste','+5562999990001');
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c1','CAND-A1',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',current_date+3,'12:00',4,'painel','confirmada','rodizio_pizza'),
 ('00000000-0000-0000-0000-0000000000c2','CAND-A2',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1',current_date+3,'13:00',2,'painel','confirmada','rodizio_pizza');
-- conversa de GOIÂNIA ligada por engano a uma reserva de ANÁPOLIS (c1); c2 não tem conversa
insert into crm_conversations(organization_id, external_id, reservation_id, unit_id) values (:'org','81','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1');
select set_config('request.jwt.claim.sub','',true);
update reservations set status='cancelada' where id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2');
select public.dispatch_reservation_confirmations();
do $$ declare p1 record; p2 record; begin
  select body into p1 from net._sent where body->>'protocol' = 'CAND-A1' and body->>'status' = 'cancelada' order by id desc limit 1;
  select body into p2 from net._sent where body->>'protocol' = 'CAND-A2' and body->>'status' = 'cancelada' order by id desc limit 1;
  assert p1.body->>'conversation_external_id' is null, 'T1 conversa de outra unidade não vale: ' || coalesce(p1.body->>'conversation_external_id','');
  assert (p1.body->>'unit_inbox_id')::int = 53, 'T2 caixa de Anápolis = 53: ' || coalesce(p1.body->>'unit_inbox_id','(nulo)');
  assert (p2.body->>'unit_inbox_id')::int = 53, 'T3 sem conversa também manda a caixa da unidade';
end $$;
rollback;
select 'ok t023' as resultado;
