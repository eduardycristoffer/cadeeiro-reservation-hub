-- Cenários da migração 020 (aparelhos + alertas no popup). Cada bloco usa ASSERT: se algo quebrar, o psql para com erro.
\set ON_ERROR_STOP on
select id as org from organizations limit 1 \gset
begin;
insert into units(id,organization_id,name,slug,city,services) values
 ('00000000-0000-0000-0000-0000000000a1',:'org','Candeeiro Goiânia','goiania','Goiânia','{almoco_quilo,rodizio_pizza}'),
 ('00000000-0000-0000-0000-0000000000a2',:'org','Candeeiro Anápolis','anapolis','Anápolis','{rodizio_carnes,rodizio_pizza}');
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000b1','gestor@x.com'),    -- gestor GO+AN, com aparelho
 ('00000000-0000-0000-0000-0000000000b2','func-an@x.com'),   -- funcionario AN, com aparelho
 ('00000000-0000-0000-0000-0000000000b3','gestor-an@x.com'), -- gestor AN, SEM aparelho
 ('00000000-0000-0000-0000-0000000000b4','dono@x.com'),      -- super admin, com aparelho
 ('00000000-0000-0000-0000-0000000000b5','func-go@x.com');   -- funcionario GO, aparelho mas silenciou reserva_pendente
update user_profiles set organization_id=:'org', is_active=true where id::text like '00000000-0000-0000-0000-0000000000b%';
delete from user_roles where user_id::text like '00000000-0000-0000-0000-0000000000b%';
insert into user_roles(user_id,role) values
 ('00000000-0000-0000-0000-0000000000b1','gestor'),('00000000-0000-0000-0000-0000000000b2','funcionario'),
 ('00000000-0000-0000-0000-0000000000b3','gestor'),('00000000-0000-0000-0000-0000000000b4','super_admin'),('00000000-0000-0000-0000-0000000000b5','funcionario');
insert into user_unit_access(user_id,unit_id) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2'),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2'),
 ('00000000-0000-0000-0000-0000000000b5','00000000-0000-0000-0000-0000000000a1');
insert into customers(id,organization_id,full_name,phone_e164,whatsapp_opt_in) values
 ('00000000-0000-0000-0000-0000000000e1',:'org','maria souza','5562990000001',true);
insert into notification_prefs(user_id, muted_kinds) values ('00000000-0000-0000-0000-0000000000b5', '{reserva_pendente}');

-- T1: as tabelas não aceitam acesso direto de quem está logado
do $$ begin
  assert not has_table_privilege('authenticated','public.push_subscriptions','select'), 'T1 push_subscriptions legível';
  assert not has_table_privilege('authenticated','public.push_subscriptions','insert'), 'T1 push_subscriptions gravável';
  assert not has_table_privilege('authenticated','public.push_outbox','select'), 'T1 push_outbox legível';
  assert not has_table_privilege('anon','public.push_subscriptions','select'), 'T1 anon';
  assert not has_function_privilege('authenticated','public.sdr_push_claim(integer)','execute'), 'T1 claim aberto';
  assert not has_function_privilege('anon','public.push_subscribe(text,text,text,text,text)','execute'), 'T1 subscribe anon';
  assert has_function_privilege('authenticated','public.push_subscribe(text,text,text,text,text)','execute'), 'T1 subscribe authenticated';
  raise notice 'T1 ok: sem acesso direto';
end $$;

-- T2: ligar aparelhos pela função (cada pessoa liga o seu)
create or replace function pg_temp.sub(uid text, n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform public.push_subscribe('https://fcm.googleapis.com/fcm/send/' || repeat('a', 20) || n, repeat('B', 87), repeat('c', 22), 'Android · Chrome', 'UA');
end $$;
select pg_temp.sub('00000000-0000-0000-0000-0000000000b1', 1);
select pg_temp.sub('00000000-0000-0000-0000-0000000000b2', 2);
select pg_temp.sub('00000000-0000-0000-0000-0000000000b4', 4);
select pg_temp.sub('00000000-0000-0000-0000-0000000000b5', 5);
do $$ begin
  assert (select count(*) from push_subscriptions) = 4, 'T2 contagem';
  assert (select count(*) from audit_log where action = 'usuario.alertas_aparelho_ligado') = 4, 'T2 auditoria';
  -- ligar o mesmo aparelho de novo atualiza em vez de duplicar (e não gera outra linha de auditoria)
  perform pg_temp.sub('00000000-0000-0000-0000-0000000000b1', 1);
  assert (select count(*) from push_subscriptions) = 4, 'T2 duplicou';
  assert (select count(*) from audit_log where action = 'usuario.alertas_aparelho_ligado') = 4, 'T2 auditoria repetida';
  raise notice 'T2 ok';
end $$;

-- T3: entradas inválidas
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  begin perform public.push_subscribe('http://inseguro.com/xxxxxxxxxxxxxxxxxxxx', repeat('B', 87), repeat('c', 22)); assert false, 'T3 http aceito';
  exception when others then assert sqlerrm = 'INVALID_SUBSCRIPTION', 'T3 http: ' || sqlerrm; end;
  begin perform public.push_subscribe('https://fcm.googleapis.com/fcm/send/xxxxxxxxxxxxxxxx', 'curta', repeat('c', 22)); assert false, 'T3 chave curta aceita';
  exception when others then assert sqlerrm = 'INVALID_SUBSCRIPTION', 'T3 chave: ' || sqlerrm; end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin perform public.push_subscribe('https://fcm.googleapis.com/fcm/send/xxxxxxxxxxxxxxxx', repeat('B', 87), repeat('c', 22)); assert false, 'T3 sem login aceito';
  exception when others then assert sqlerrm = 'FORBIDDEN', 'T3 login: ' || sqlerrm; end;
  raise notice 'T3 ok';
end $$;

-- T4: reserva nova do site -> popup para quem tem aparelho, vê a unidade e não silenciou o tipo
set local request.jwt.claim.sub = '';
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c1','R1',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date+2,'20:00',4,'landing_page','pendente','rodizio_pizza');
do $$ declare ids uuid[]; n record; begin
  select * into n from notifications where entity_id='00000000-0000-0000-0000-0000000000c1';
  select array_agg(user_id order by user_id) into ids from push_outbox where notification_id = n.id;
  -- GO: gestor b1 (aparelho), dono b4 (aparelho). func-go b5 silenciou o tipo; func-an b2 é de AN; gestor-an b3 não tem aparelho
  assert ids = array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4']::uuid[], 'T4 destinatários: ' || ids::text;
  assert (select title from push_outbox where notification_id = n.id limit 1) = 'Nova reserva para aprovar', 'T4 título';
  assert (select link from push_outbox where notification_id = n.id limit 1) = '/admin/aprovacoes', 'T4 link';
  raise notice 'T4 ok';
end $$;

-- T5: grupo grande vai só para gestor/dono (funcionário não recebe); funcionário de AN recebe reserva de AN
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service,is_large_group) values
 ('00000000-0000-0000-0000-0000000000c2','R2',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1',current_date+5,'20:00',40,'landing_page','pendente','rodizio_pizza',true),
 ('00000000-0000-0000-0000-0000000000c3','R3',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1',current_date+3,'19:00',3,'landing_page','pendente','rodizio_pizza',false);
do $$ declare a uuid[]; b uuid[]; begin
  select array_agg(user_id order by user_id) into a from push_outbox o join notifications n on n.id = o.notification_id where n.entity_id='00000000-0000-0000-0000-0000000000c2';
  select array_agg(user_id order by user_id) into b from push_outbox o join notifications n on n.id = o.notification_id where n.entity_id='00000000-0000-0000-0000-0000000000c3';
  assert a = array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4']::uuid[], 'T5 grupo grande: ' || a::text;
  assert b = array['00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b4']::uuid[], 'T5 AN: ' || b::text;
  raise notice 'T5 ok';
end $$;

-- T6: não duplica o popup do mesmo alerta
do $$ declare c int; begin
  select count(*) into c from push_outbox;
  perform public._notify('reserva_pendente','00000000-0000-0000-0000-0000000000a1','info','x','y','/admin/aprovacoes','00000000-0000-0000-0000-0000000000c1');
  assert (select count(*) from push_outbox) = c, 'T6 duplicou';
  raise notice 'T6 ok';
end $$;

-- T7: popup de teste (próprio, com limite de frequência)
do $$ declare id1 uuid; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  id1 := public.push_test();
  assert (select kind from push_outbox where id = id1) = 'teste', 'T7 tipo';
  begin perform public.push_test(); assert false, 'T7 sem limite';
  exception when others then assert sqlerrm = 'TOO_FAST', 'T7 limite: ' || sqlerrm; end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
  begin perform public.push_test(); assert false, 'T7 sem aparelho';
  exception when others then assert sqlerrm = 'NO_DEVICE', 'T7 aparelho: ' || sqlerrm; end;
  raise notice 'T7 ok';
end $$;

-- T8: servidor pega a fila com os aparelhos de cada pessoa e dá baixa
do $$ declare got jsonb; item jsonb; sid uuid; oid uuid; begin
  got := public.sdr_push_claim(100);
  assert jsonb_array_length(got) = (select count(*) from push_outbox where status = 'enviando'), 'T8 contagem';
  assert (select count(*) from push_outbox where status = 'pendente') = 0, 'T8 sobrou pendente';
  item := (select x from jsonb_array_elements(got) x where x->>'kind' = 'teste');
  assert jsonb_array_length(item->'subs') = 1, 'T8 aparelhos';
  assert item->'subs'->0->>'endpoint' like 'https://fcm.googleapis.com/%', 'T8 endpoint';
  oid := (item->>'id')::uuid; sid := (item->'subs'->0->>'id')::uuid;
  perform public.sdr_push_sub_result(sid, true);
  perform public.sdr_push_mark(oid, 1);
  assert (select status from push_outbox where id = oid) = 'enviado', 'T8 enviado';
  assert (select last_success_at from push_subscriptions where id = sid) is not null, 'T8 sucesso do aparelho';
  raise notice 'T8 ok';
end $$;

-- T9: falha de rede tenta de novo; aparelho que "não existe mais" é apagado; sem aparelho cancela
do $$ declare oid uuid; sid uuid; begin
  select o.id into oid from push_outbox o where o.status = 'enviando' and o.user_id = '00000000-0000-0000-0000-0000000000b2' limit 1;
  select s.id into sid from push_subscriptions s where s.user_id = '00000000-0000-0000-0000-0000000000b2';
  perform public.sdr_push_sub_result(sid, false, false, 'push: sem conexão');
  assert (select failures from push_subscriptions where id = sid) = 1, 'T9 falhas';
  perform public.sdr_push_mark(oid, 0, true, 'push: sem conexão');
  assert (select status from push_outbox where id = oid) = 'pendente', 'T9 repetir';
  assert (select scheduled_for from push_outbox where id = oid) > now(), 'T9 espera';

  select o.id into oid from push_outbox o where o.status = 'enviando' and o.user_id = '00000000-0000-0000-0000-0000000000b4' limit 1;
  select s.id into sid from push_subscriptions s where s.user_id = '00000000-0000-0000-0000-0000000000b4';
  perform public.sdr_push_sub_result(sid, false, true, 'push 410');
  assert not exists (select 1 from push_subscriptions where id = sid), 'T9 não apagou aparelho morto';
  perform public.sdr_push_mark(oid, 0, false, null);
  assert (select status from push_outbox where id = oid) = 'cancelado', 'T9 cancelar';
  raise notice 'T9 ok';
end $$;

-- T10: oito falhas seguidas desligam o aparelho; popup velho expira; limite de 10 aparelhos
do $$ declare sid uuid; i int; begin
  select s.id into sid from push_subscriptions s where s.user_id = '00000000-0000-0000-0000-0000000000b5';
  for i in 1..8 loop perform public.sdr_push_sub_result(sid, false, false, 'x'); end loop;
  assert (select disabled_at from push_subscriptions where id = sid) is not null, 'T10 desligar';
  assert not exists (select 1 from public._push_recipients((select id from organizations limit 1), 'sac_novo', '00000000-0000-0000-0000-0000000000a1') where user_id = '00000000-0000-0000-0000-0000000000b5'), 'T10 ainda recebe';

  insert into push_outbox (user_id, kind, severity, title, created_at) values ('00000000-0000-0000-0000-0000000000b1', 'teste', 'info', 'velho', now() - interval '4 hours');
  perform public.sdr_push_claim(100);
  assert (select status from push_outbox where title = 'velho') = 'cancelado', 'T10 expirar';

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  for i in 20..40 loop perform public.push_subscribe('https://fcm.googleapis.com/fcm/send/' || repeat('z', 20) || i, repeat('B', 87), repeat('c', 22)); end loop;
  assert (select count(*) from push_subscriptions where user_id = '00000000-0000-0000-0000-0000000000b2') = 10, 'T10 limite de aparelhos';
  raise notice 'T10 ok';
end $$;

-- T11: lista, remove e desliga o próprio aparelho; não mexe no de outra pessoa
do $$ declare mine uuid; other uuid; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  assert (select count(*) from public.push_devices()) = 1, 'T11 lista';
  assert (select device_label from public.push_devices()) = 'Android · Chrome', 'T11 nome';
  select s.id into other from push_subscriptions s where s.user_id = '00000000-0000-0000-0000-0000000000b2' limit 1;
  begin perform public.push_device_remove(other); assert false, 'T11 removeu de outra pessoa';
  exception when others then assert sqlerrm = 'NOT_FOUND', 'T11 outra: ' || sqlerrm; end;
  perform public.push_unsubscribe('https://fcm.googleapis.com/fcm/send/' || repeat('a', 20) || 1);
  assert (select count(*) from public.push_devices()) = 0, 'T11 desligar';
  assert exists (select 1 from audit_log where action = 'usuario.alertas_aparelho_desligado'), 'T11 auditoria';
  -- desligar o endpoint de outra pessoa não faz nada
  perform public.push_unsubscribe('https://fcm.googleapis.com/fcm/send/' || repeat('a', 20) || 2);
  assert exists (select 1 from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/' || repeat('a', 20) || 2), 'T11 apagou de outra';
  raise notice 'T11 ok';
end $$;

-- T12: pessoa que sai da equipe (desativada) para de receber
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true);
  update user_profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000b2';
  assert not exists (select 1 from public._push_recipients((select id from organizations limit 1), 'reserva_pendente', '00000000-0000-0000-0000-0000000000a2') where user_id = '00000000-0000-0000-0000-0000000000b2'), 'T12 desativado ainda recebe';
  raise notice 'T12 ok';
end $$;
rollback;
