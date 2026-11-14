-- Cenários da migração 017 (webhook do Wi-Fi). Cada bloco usa ASSERT: se algo quebrar, o psql para com erro.
\set ON_ERROR_STOP on
select id as org from organizations limit 1 \gset
begin;
insert into units(id,organization_id,name,slug,city,services) values
 ('00000000-0000-0000-0000-0000000000a1',:'org','Candeeiro Goiânia','goiania','Goiânia','{almoco_quilo,rodizio_pizza}'),
 ('00000000-0000-0000-0000-0000000000a2',:'org','Candeeiro Anápolis','anapolis','Anápolis','{rodizio_carnes,rodizio_pizza}');
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000b1','gestor-go@x.com'),
 ('00000000-0000-0000-0000-0000000000b2','func-go@x.com'),
 ('00000000-0000-0000-0000-0000000000b3','gestor-an@x.com'),
 ('00000000-0000-0000-0000-0000000000b4','dono@x.com');
update user_profiles set organization_id=:'org', is_active=true where id::text like '00000000-0000-0000-0000-0000000000b%';
delete from user_roles where user_id::text like '00000000-0000-0000-0000-0000000000b%';
insert into user_roles(user_id,role) values
 ('00000000-0000-0000-0000-0000000000b1','gestor'),('00000000-0000-0000-0000-0000000000b2','funcionario'),
 ('00000000-0000-0000-0000-0000000000b3','gestor'),('00000000-0000-0000-0000-0000000000b4','super_admin');
insert into user_unit_access(user_id,unit_id) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2');

-- T1: permissões para criar endereço
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin begin perform public.webhook_endpoint_create('Wi-Fi Goiânia','00000000-0000-0000-0000-0000000000a1'); raise exception 'T1 funcionário criou'; exception when others then assert sqlerrm='FORBIDDEN', 'T1 func: '||sqlerrm; end; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  begin perform public.webhook_endpoint_create('Wi-Fi AN','00000000-0000-0000-0000-0000000000a2'); raise exception 'T1 gestor GO criou em AN'; exception when others then assert sqlerrm='FORBIDDEN', 'T1 outra unidade: '||sqlerrm; end;
  begin perform public.webhook_endpoint_create('Rede toda',null); raise exception 'T1 gestor criou da rede'; exception when others then assert sqlerrm='FORBIDDEN', 'T1 rede: '||sqlerrm; end;
  begin perform public.webhook_endpoint_create('x','00000000-0000-0000-0000-0000000000a1'); raise exception 'T1 nome curto'; exception when others then assert sqlerrm='INVALID_NAME', 'T1 nome: '||sqlerrm; end;
  begin perform public.webhook_endpoint_create('Wi-Fi','00000000-0000-0000-0000-0000000000a1','xpto'); raise exception 'T1 tipo'; exception when others then assert sqlerrm='INVALID_KIND', 'T1 tipo: '||sqlerrm; end;
  raise notice 'T1 ok';
end $$;
reset role; set local request.jwt.claim.sub = '';

-- T2: gestor GO cria o endereço dele; o token só aparece uma vez e o banco guarda só o hash
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select (public.webhook_endpoint_create('Wi-Fi Goiânia','00000000-0000-0000-0000-0000000000a1'))->>'token' as tok_go \gset
reset role; set local request.jwt.claim.sub = '';
select encode(sha256(convert_to(:'tok_go','UTF8')),'hex') as h_go \gset
do $$ declare e record; begin
  select * into e from webhook_endpoints where name='Wi-Fi Goiânia';
  assert length(e.token_hash) = 64 and length(e.token_hint) = 4, 'T2 hash/hint';
  assert not exists (select 1 from webhook_endpoints where token_hash like 'whk_%'), 'T2 token puro no banco';
  assert exists (select 1 from audit_log where action='webhook.criado'), 'T2 auditoria';
  raise notice 'T2 ok';
end $$;
select 'ok' as chk from webhook_endpoints where token_hash = :'h_go' \gset

-- T3: token errado e endereço desligado
do $$ begin
  assert public.webhook_ingest('0000', '{"phone":"62999990001"}'::jsonb) = '{"ok": false, "error": "NOT_FOUND"}'::jsonb, 'T3 token errado';
  raise notice 'T3 ok';
end $$;

-- T4: conexão com nome, telefone, consentimento -> visitante + visita + contato no CRM
select public.webhook_ingest(:'h_go', '{"event":"connect","name":"João da Silva","phone":"(62) 99999-0001","email":"JOAO@x.com","mac":"AA:BB:CC:DD:EE:01","consent":"true"}'::jsonb)::text as r4 \gset
do $$ declare g record; begin
  select * into g from wifi_guests where phone_e164='5562999990001';
  assert g.full_name='João da Silva' and g.email='joao@x.com' and g.marketing_consent and g.visits=1, 'T4 visitante';
  assert g.unit_id='00000000-0000-0000-0000-0000000000a1', 'T4 unidade do endereço';
  assert g.device_key is not null and g.device_key not like '%AA%', 'T4 aparelho só em hash';
  assert exists (select 1 from customers where phone_e164='5562999990001' and whatsapp_opt_in), 'T4 contato do CRM';
  assert g.customer_id is not null, 'T4 vínculo';
  assert (select count(*) from wifi_visits where guest_id=g.id)=1, 'T4 visita';
  assert (select last_event_at from webhook_endpoints where name='Wi-Fi Goiânia') is not null, 'T4 último evento';
  raise notice 'T4 ok';
end $$;

-- T5: reconexão em menos de 30 min não conta visita; nome novo atualiza; aninhado e outros nomes de campo funcionam
select public.webhook_ingest(:'h_go', '{"event":"connect","phone":"62999990001"}'::jsonb) \gset
select public.webhook_ingest(:'h_go', '{"data":{"client":{"celular":"62 99999 0002","nome":"Ana Lima","aceite":"sim"}},"type":"login"}'::jsonb) \gset
do $$ declare g record; begin
  select * into g from wifi_guests where phone_e164='5562999990001';
  assert g.visits=1, 'T5 reconexão contou visita: '||g.visits;
  select * into g from wifi_guests where phone_e164='5562999990002';
  assert g.full_name='Ana Lima' and g.marketing_consent, 'T5 aninhado: '||coalesce(g.full_name,'?');
  raise notice 'T5 ok';
end $$;

-- T6: segunda visita (depois de 30 min) conta; consentimento nunca é perdido; opt-out do CRM é respeitado
update wifi_visits set connected_at = now() - interval '2 hours';
update customers set whatsapp_opt_in=false, whatsapp_opt_out_at=now() where phone_e164='5562999990001';
select public.webhook_ingest(:'h_go', '{"phone":"62999990001","name":"João S.","consent":"false"}'::jsonb) \gset
do $$ declare g record; begin
  select * into g from wifi_guests where phone_e164='5562999990001';
  assert g.visits=2, 'T6 visitas: '||g.visits;
  assert g.marketing_consent, 'T6 consentimento perdido';
  assert g.full_name='João S.', 'T6 nome';
  assert not (select whatsapp_opt_in from customers where phone_e164='5562999990001'), 'T6 reativou quem pediu para sair';
  raise notice 'T6 ok';
end $$;

-- T7: sem identificação, desconexão, corpo inválido, telefone inválido com e-mail
select public.webhook_ingest(:'h_go', '{"event":"connect","ssid":"Candeeiro"}'::jsonb) \gset
select public.webhook_ingest(:'h_go', '{"event":"disconnect","phone":"62999990003"}'::jsonb) \gset
select public.webhook_ingest(:'h_go', '"texto solto"'::jsonb) \gset
select public.webhook_ingest(:'h_go', '{"phone":"123","email":"so-email@x.com"}'::jsonb) \gset
select public.webhook_ingest(:'h_go', '[{"phone":"62999990004","name":"Lista"}]'::jsonb) \gset
do $$ begin
  assert (select count(*) from webhook_events where error='SEM_IDENTIFICACAO')=1, 'T7 sem id';
  assert (select count(*) from webhook_events where error='DESCONEXAO')=1, 'T7 desconexão';
  assert not exists (select 1 from wifi_guests where phone_e164='5562999990003'), 'T7 desconexão criou visitante';
  assert (select count(*) from webhook_events where status='erro' and error='CORPO_INVALIDO')=1, 'T7 corpo inválido';
  assert exists (select 1 from wifi_guests where email='so-email@x.com' and phone_e164 is null), 'T7 só e-mail';
  assert exists (select 1 from wifi_guests where phone_e164='5562999990004' and full_name='Lista'), 'T7 lista';
  raise notice 'T7 ok';
end $$;

-- T8: sem consentimento não entra no CRM
select public.webhook_ingest(:'h_go', '{"phone":"62999990005","name":"Sem Aceite"}'::jsonb) \gset
do $$ begin
  assert exists (select 1 from wifi_guests where phone_e164='5562999990005' and not marketing_consent and customer_id is null), 'T8 visitante';
  assert not exists (select 1 from customers where phone_e164='5562999990005'), 'T8 virou contato sem aceite';
  raise notice 'T8 ok';
end $$;

-- T9: endereço da rede toda descobre a unidade pelo corpo
insert into webhook_endpoints(organization_id,unit_id,name,kind,token_hash,token_hint) values (:'org',null,'Rede','wifi',encode(sha256(convert_to('rede','UTF8')),'hex'),'rede');
select public.webhook_ingest(encode(sha256(convert_to('rede','UTF8')),'hex'), '{"phone":"62999990006","unidade":"Anápolis"}'::jsonb) \gset
select public.webhook_ingest(encode(sha256(convert_to('rede','UTF8')),'hex'), '{"phone":"62999990007","unit":"anapolis"}'::jsonb) \gset
do $$ begin
  assert (select unit_id from wifi_guests where phone_e164='5562999990006')='00000000-0000-0000-0000-0000000000a2', 'T9 por nome';
  assert (select unit_id from wifi_guests where phone_e164='5562999990007')='00000000-0000-0000-0000-0000000000a2', 'T9 por slug';
  raise notice 'T9 ok';
end $$;

-- T10: cruza com reservas (reservou depois / já tinha reserva)
insert into customers(id,organization_id,full_name,phone_e164,whatsapp_opt_in) values
 ('00000000-0000-0000-0000-0000000000e2',:'org','Ana Lima','5562999990002',true)
 on conflict (organization_id, phone_e164) do nothing;
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service)
 select '00000000-0000-0000-0000-0000000000c1','R1',:'org','00000000-0000-0000-0000-0000000000a1',c.id,current_date+2,'20:00',4,'landing_page','pendente','rodizio_pizza' from customers c where c.phone_e164='5562999990002';
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare o jsonb; l jsonb; begin
  o := public.wifi_overview(30, null);
  assert (o->'totals'->>'reserved')::int = 1 and (o->'totals'->>'reserved_after')::int = 1, 'T10 conversão: '||(o->'totals')::text;
  assert (o->'totals'->>'with_consent')::int >= 2, 'T10 consentimento';
  assert jsonb_array_length(o->'by_day') = 30 and jsonb_array_length(o->'by_hour') = 24, 'T10 séries';
  -- gestor GO não enxerga visitantes de Anápolis nem da rede sem unidade
  assert not exists (select 1 from jsonb_array_elements(public.wifi_guests_list(null,null,200)) x where x->>'phone' in ('5562999990006','5562999990007')), 'T10 vazou outra unidade';
  assert exists (select 1 from jsonb_array_elements(public.wifi_guests_list(null,null,200)) x where x->>'phone' = '5562999990001'), 'T10 não viu a própria unidade';
  l := public.wifi_guests_list(null,'ana',50);
  assert jsonb_array_length(l)=1 and (l->0->>'reserved')::boolean, 'T10 busca por nome: '||l::text;
  l := public.wifi_guests_list(null,'(62) 99999-0001',50);
  assert jsonb_array_length(l)=1, 'T10 busca por telefone';
  l := public.wifi_guests_list(null,'%',50);
  assert jsonb_array_length(l)>=1, 'T10 curinga não deve quebrar';
  raise notice 'T10 ok';
end $$;
reset role; set local request.jwt.claim.sub = '';

-- T11: funcionário não vê; super admin vê tudo; gestor de AN só AN
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  begin perform public.wifi_overview(30,null); raise exception 'T11 func overview'; exception when others then assert sqlerrm='FORBIDDEN', 'T11 a: '||sqlerrm; end;
  begin perform public.wifi_guests_list(null,null,10); raise exception 'T11 func lista'; exception when others then assert sqlerrm='FORBIDDEN', 'T11 b: '||sqlerrm; end;
  begin perform public.webhook_endpoints_list(); raise exception 'T11 func endpoints'; exception when others then assert sqlerrm='FORBIDDEN', 'T11 c: '||sqlerrm; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$ begin
  assert jsonb_array_length(public.webhook_endpoints_list())=0, 'T11 gestor AN viu endereço de GO';
  assert (select count(*) from jsonb_array_elements(public.wifi_guests_list(null,null,200)))=2, 'T11 gestor AN deveria ver 2';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b4';
do $$ begin
  assert jsonb_array_length(public.webhook_endpoints_list())=2, 'T11 dono vê os 2 endereços';
  assert (select count(*) from jsonb_array_elements(public.wifi_guests_list(null,null,200))) >= 7, 'T11 dono vê todos';
  raise notice 'T11 ok';
end $$;
reset role; set local request.jwt.claim.sub = '';

-- T12: trocar o token invalida o antigo; desativar bloqueia
select id as ep_go from webhook_endpoints where name='Wi-Fi Goiânia' \gset
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select (public.webhook_endpoint_rotate(:'ep_go'))->>'token' as tok_new \gset
reset role; set local request.jwt.claim.sub = '';
select encode(sha256(convert_to(:'tok_new','UTF8')),'hex') as h_new \gset
select public.webhook_ingest(:'h_go', '{"phone":"62999990009"}'::jsonb)->>'error' as old_tok \gset
select public.webhook_ingest(:'h_new', '{"phone":"62999990009"}'::jsonb)->>'ok' as new_ok \gset
select set_config('t.old', :'old_tok', false) as x1, set_config('t.new', :'new_ok', false) as x2 \gset
do $$ begin
  assert current_setting('t.old') = 'NOT_FOUND', 'T12 token antigo ainda vale';
  assert current_setting('t.new') = 'true', 'T12 token novo não vale';
  raise notice 'T12 ok';
end $$;
-- desativado bloqueia
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.webhook_endpoint_set_active(:'ep_go', false) as x \gset
reset role; set local request.jwt.claim.sub = '';
select public.webhook_ingest(:'h_new', '{"phone":"62999990010"}'::jsonb)->>'error' as off \gset
select set_config('t.off', :'off', false) as x \gset
do $$ begin
  assert current_setting('t.off') = 'NOT_FOUND', 'T12 endereço desligado ainda recebe';
  assert exists (select 1 from audit_log where action='webhook.desativado'), 'T12 auditoria';
  raise notice 'T12b ok';
end $$;

-- T13: privilégios
do $$ begin
  assert not has_function_privilege('authenticated', 'public.webhook_ingest(text,jsonb)', 'execute'), 'T13 authenticated executa ingest';
  assert not has_function_privilege('anon', 'public.webhook_ingest(text,jsonb)', 'execute'), 'T13 anon executa ingest';
  assert not has_function_privilege('anon', 'public.wifi_overview(integer,uuid)', 'execute'), 'T13 anon overview';
  assert has_function_privilege('service_role', 'public.webhook_ingest(text,jsonb)', 'execute'), 'T13 service_role';
  assert not has_table_privilege('authenticated', 'public.wifi_guests', 'select'), 'T13 authenticated lê visitantes direto';
  assert not has_table_privilege('authenticated', 'public.webhook_events', 'select'), 'T13 authenticated lê eventos direto';
  assert not has_table_privilege('anon', 'public.webhook_endpoints', 'select'), 'T13 anon lê endpoints';
  raise notice 'T13 ok';
end $$;
rollback;
