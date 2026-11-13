select id as org from organizations limit 1 \gset
begin;
insert into units(id,organization_id,name,slug,city,services) values
 ('00000000-0000-0000-0000-0000000000a1',:'org','Candeeiro Goiânia','goiania','Goiânia','{almoco_quilo,rodizio_pizza}'),
 ('00000000-0000-0000-0000-0000000000a2',:'org','Candeeiro Anápolis','anapolis','Anápolis','{rodizio_carnes,rodizio_pizza}');
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000b1','gestor@x.com'),('00000000-0000-0000-0000-0000000000b2','func@x.com'),('00000000-0000-0000-0000-0000000000b3','gestor-an@x.com');
update user_profiles set organization_id=:'org', full_name='Gestora', is_active=true where id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3');
delete from user_roles where user_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3');
insert into user_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000b1','gestor'),('00000000-0000-0000-0000-0000000000b2','funcionario'),('00000000-0000-0000-0000-0000000000b3','gestor');
insert into user_unit_access(user_id,unit_id) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2');

insert into customers(id,organization_id,full_name,phone_e164,whatsapp_opt_in,whatsapp_opt_out_at) values
 ('00000000-0000-0000-0000-0000000000e1',:'org','ana souza','5562990000001',true,null),
 ('00000000-0000-0000-0000-0000000000e2',:'org','Bruno Lima','5562990000002',true,null),
 ('00000000-0000-0000-0000-0000000000e3',:'org','Carla Dias','5562990000003',false,now()),
 ('00000000-0000-0000-0000-0000000000e4',:'org','Diego Reis','5562990000004',false,null),
 ('00000000-0000-0000-0000-0000000000e5',:'org','Eva Neri','5562990000005',true,null),
 ('00000000-0000-0000-0000-0000000000e6',:'org','Fábio Cruz','5562990000006',true,null),
 ('00000000-0000-0000-0000-0000000000e7',:'org','Gabi Luz','5562990000007',true,null),
 ('00000000-0000-0000-0000-0000000000e8',:'org','Hugo Sá','5562990000008',true,null),
 ('00000000-0000-0000-0000-0000000000e9',:'org','Iara Paz','5562990000009',true,null);
insert into reservations(protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('C1',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date-90,'12:00',2,'telefone','concluida','rodizio_pizza'),
 ('C2',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e2',current_date-10,'12:00',2,'telefone','concluida','rodizio_pizza'),
 ('C3',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e3',current_date-100,'12:00',2,'telefone','concluida','rodizio_carnes'),
 ('C4',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e4',current_date-100,'12:00',2,'telefone','concluida','rodizio_pizza'),
 ('C5',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e5',current_date-120,'12:00',2,'telefone','concluida','rodizio_pizza'),
 ('C5F',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e5',current_date+3,'12:00',2,'telefone','confirmada','rodizio_pizza'),
 ('C6',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e6',current_date-80,'12:00',2,'telefone','concluida','rodizio_carnes');
insert into whatsapp_leads(organization_id,customer_id,unit_id,city,full_name,phone_e164,status,created_at) values
 (:'org','00000000-0000-0000-0000-0000000000e7','00000000-0000-0000-0000-0000000000a1','goiania','Gabi Luz','5562990000007','novo',now()-interval '30 hours'),
 (:'org','00000000-0000-0000-0000-0000000000e8','00000000-0000-0000-0000-0000000000a1','goiania','Hugo Sá','5562990000008','novo',now()-interval '1 hour'),
 (:'org','00000000-0000-0000-0000-0000000000e9','00000000-0000-0000-0000-0000000000a1','goiania','Iara Paz','5562990000009','novo',now()-interval '30 hours');
insert into reservations(protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('C9',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e9',current_date+5,'12:00',2,'telefone','pendente','rodizio_pizza');
-- ate aqui nenhuma regra do CRM foi usada: janela larga para o teste nao depender do relogio
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T1 defaults' t, public.crm_settings_get() r;
do $$ begin begin perform public.crm_settings_save('{"daily_cap":0}'::jsonb); raise notice 'T2a RUIM'; exception when others then raise notice 'T2a cap 0: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_settings_save('{"send_window_start":"20:00","send_window_end":"09:00"}'::jsonb); raise notice 'T2b RUIM'; exception when others then raise notice 'T2b janela invertida: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_settings_save('{"public_url":"http://x.com"}'::jsonb); raise notice 'T2c RUIM'; exception when others then raise notice 'T2c url http: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_settings_save('{"daily_cap":"abc"}'::jsonb); raise notice 'T2d RUIM'; exception when others then raise notice 'T2d cap texto: %', sqlerrm; end; end $$;
select public.crm_settings_save('{"public_url":"https://Candeeiro.com.br/","send_window_start":"00:00","send_window_end":"23:59","daily_cap":50,"followup_pos_delay_hours":1}'::jsonb);
select 'T2 salvo' t, public.crm_settings_get() r;

select 'T3 modelos' t, jsonb_array_length(public.crm_templates_list()) n, (select count(*) from jsonb_array_elements(public.crm_templates_list()) e where (e->>'is_custom')::boolean) custom;
do $$ begin begin perform public.crm_template_save('cancelamento','Oi {{Nome}} tudo bem'); raise notice 'T3a RUIM'; exception when others then raise notice 'T3a var maiuscula: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_template_save('xxx','Oi {{nome}} tudo bem'); raise notice 'T3b RUIM'; exception when others then raise notice 'T3b chave: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_template_save('cancelamento','curto'); raise notice 'T3c RUIM'; exception when others then raise notice 'T3c curto: %', sqlerrm; end; end $$;
reset role;

-- render (como dono): linha com variavel vazia some
select 'T4 sem motivo' t, public._crm_render(E'Oi {{nome}}\nMotivo: {{motivo}}\nFim', '{"nome":"Ana","motivo":null}'::jsonb) r;
select 'T4b com motivo' t, public._crm_render(E'Oi {{nome}}\nMotivo: {{motivo}}\nFim', '{"nome":"Ana","motivo":"Casa cheia"}'::jsonb) r;
select 'T4c rodape' t, public._crm_finalize('remarketing','Oi') r1, public._crm_finalize('remarketing','Oi, responda SAIR') r2, public._crm_finalize('confirmacao','Oi') r3;
select 'T4d valor com chaves' t, public._crm_render('Oi {{nome}} e {{unidade}}', '{"nome":"{{unidade}}","unidade":"X"}'::jsonb) r;

set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin begin perform public.crm_settings_get(); raise notice 'T5 RUIM'; exception when others then raise notice 'T5 funcionario settings: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_audience_preview('inativos', null, 60); raise notice 'T5b RUIM'; exception when others then raise notice 'T5b funcionario preview: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_campaign_launch('x1','inativos',null,60,'Oi {{nome}} venha'); raise notice 'T5c RUIM'; exception when others then raise notice 'T5c funcionario launch: %', sqlerrm; end; end $$;
reset role;

set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T6 inativos 60d (todos)' t, public.crm_audience_preview('inativos', null, 60) r;
select 'T6b visitaram' t, (public.crm_audience_preview('visitaram', null, 60)->>'total')::int total;
select 'T6c leads' t, (public.crm_audience_preview('leads', null, 60)->>'total')::int total;
select 'T6d inativos 5d' t, (public.crm_audience_preview('inativos', null, 5)->>'total')::int total;
reset role;

set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
select 'T7 gestor AN inativos' t, (public.crm_audience_preview('inativos', null, 60)->>'total')::int total, public.crm_audience_preview('inativos', null, 60)->'sample' sample;
do $$ begin begin perform public.crm_audience_preview('inativos', '00000000-0000-0000-0000-0000000000a1', 60); raise notice 'T7b RUIM'; exception when others then raise notice 'T7b AN pede GO: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_campaign_launch('Teste','inativos','00000000-0000-0000-0000-0000000000a1',60,'Oi {{nome}} venha {{link}}'); raise notice 'T7c RUIM'; exception when others then raise notice 'T7c AN lanca GO: %', sqlerrm; end; end $$;
select 'T8 launch AN' t, public.crm_campaign_launch('Páscoa Doce!','inativos',null,60,'Oi {{nome}}, temos novidade no {{unidade}}!\nReserve: {{link}}') r;
do $$ begin begin perform public.crm_campaign_launch('Repete','inativos',null,60,'Oi {{nome}} venha de novo'); raise notice 'T8b RUIM'; exception when others then raise notice 'T8b repetir (intervalo): %', sqlerrm; end; end $$;
select 'T8c envios' t, kind, status, first_name, left(phone_e164,6) tel, text from public.crm_sends order by created_at;
reset role;

-- automacoes ligadas
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.crm_settings_save('{"followup_pos_enabled":true,"reaver_inativo_enabled":true,"reaver_lead_enabled":true,"reaver_lead_hours":24}'::jsonb);
reset role;
insert into reservations(protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('POS1',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e2',current_date-1,'00:30',2,'telefone','concluida','rodizio_pizza');
select 'T9 automacoes' t, public.crm_run_automations() novos;
select 'T9b de novo (idempotente)' t, public.crm_run_automations() novos;
select 'T9c por tipo' t, kind, count(*) from public.crm_sends group by kind order by kind;
select 'T9d textos' t, kind, first_name, text from public.crm_sends where kind <> 'remarketing' order by kind;

-- fila do n8n
select 'T10 due(2)' t, jsonb_array_length(public.sdr_crm_sends_due(2, null)) n;
select 'T10b status' t, status, count(*) from public.crm_sends group by status order by status;
-- recoloca tudo como pendente para testar travas com fila cheia (4 envios)
update public.crm_sends set status = 'pendente', attempts = 0;
-- limite diario = 3: libera 3 e o quarto fica
update public.crm_marketing_settings set daily_cap = 3;
select 'T11 cap=3 libera' t, jsonb_array_length(public.sdr_crm_sends_due(10, null)) n;
select 'T11b depois do cap' t, jsonb_array_length(public.sdr_crm_sends_due(10, null)) n, (select count(*) from public.crm_sends where status = 'pendente') ainda_pendentes;
update public.crm_marketing_settings set daily_cap = 50;
-- fora da janela: nada sai, mas o pendente continua
do $$ declare s time := (now() at time zone 'America/Sao_Paulo')::time; a time; b time; begin
  if s < time '21:00' then a := s + interval '1 hour'; b := s + interval '2 hours'; else a := s - interval '3 hours'; b := s - interval '2 hours'; end if;
  update public.crm_marketing_settings set send_window_start = a, send_window_end = b;
  raise notice 'T12 fora da janela libera: % (pendentes: %)', jsonb_array_length(public.sdr_crm_sends_due(10, null)), (select count(*) from public.crm_sends where status = 'pendente');
  update public.crm_marketing_settings set send_window_start = '00:00', send_window_end = '23:59';
end $$;
-- opt-out depois de enfileirar: o pendente vira cancelado e nao sai
update public.crm_sends set status = 'pendente', attempts = 0;
update customers set whatsapp_opt_out_at = now(), whatsapp_opt_in = false where id = '00000000-0000-0000-0000-0000000000e7';
select 'T13 due apos opt-out' t, jsonb_array_length(public.sdr_crm_sends_due(10, null)) n;
select 'T13b envio do e7' t, status, last_error from public.crm_sends where customer_id = '00000000-0000-0000-0000-0000000000e7';
select 'T13c ninguem mais duas vezes' t, jsonb_array_length(public.sdr_crm_sends_due(10, null)) n;
-- resultado
select id as sid from public.crm_sends where status = 'enviando' order by created_at limit 1 \gset
select 'T14 marca ok' t, public.sdr_mark_crm_send(:'sid', true, null);
select 'T14b status' t, status, sent_at is not null enviado_em from public.crm_sends where id = :'sid';
do $$ begin begin perform public.sdr_mark_crm_send('00000000-0000-0000-0000-00000000dead', true, null); raise notice 'T14c RUIM'; exception when others then raise notice 'T14c id inexistente: %', sqlerrm; end; end $$;
select id as sid2 from public.crm_sends where status = 'enviando' order by created_at limit 1 \gset
select 'T15 marca falha 1' t, public.sdr_mark_crm_send(:'sid2', false, 'timeout');
select 'T15b status' t, status, attempts, last_error, scheduled_for > now() reagendado from public.crm_sends where id = :'sid2';
update public.crm_sends set attempts = 3, status = 'enviando' where id = :'sid2';
select 'T15c falha final' t, public.sdr_mark_crm_send(:'sid2', false, 'timeout');
select 'T15d status' t, status from public.crm_sends where id = :'sid2';

-- painel: cancelar/reenviar
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.crm_send_retry(:'sid2');
select 'T16 retry' t, status, attempts from public.crm_sends where id = :'sid2';
do $$ begin begin perform public.crm_send_retry((select id from public.crm_sends where status = 'enviado' limit 1)); raise notice 'T16b RUIM'; exception when others then raise notice 'T16b retry de enviado: %', sqlerrm; end; end $$;
select 'T17 overview' t, public.crm_overview() r;
reset role;
update public.crm_sends set status = 'pendente' where id in (select id from public.crm_sends where unit_id = '00000000-0000-0000-0000-0000000000a1' and customer_id <> '00000000-0000-0000-0000-0000000000e7' limit 1);
update public.crm_sends set status = 'pendente' where campaign_id is not null;
select id as gopend from public.crm_sends where unit_id = '00000000-0000-0000-0000-0000000000a1' and status = 'pendente' limit 1 \gset
select set_config('t.gopend', :'gopend', true);
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$ begin begin perform public.crm_send_cancel(current_setting('t.gopend')::uuid); raise notice 'T18 RUIM'; exception when others then raise notice 'T18 AN cancela envio de GO: %', sqlerrm; end; end $$;
select 'T18b AN ve envios' t, count(*) filter (where unit_id = '00000000-0000-0000-0000-0000000000a1') go, count(*) filter (where unit_id = '00000000-0000-0000-0000-0000000000a2') an from public.crm_sends;
reset role;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T19 cancelar campanha' t, public.crm_campaign_cancel((select id from public.crm_campaigns limit 1)) cancelados;
reset role;

-- permissoes de funcoes internas
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin begin perform public.sdr_crm_sends_due(1, null); raise notice 'T20 RUIM'; exception when others then raise notice 'T20 authenticated em sdr_crm_sends_due: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_run_automations(); raise notice 'T20b RUIM'; exception when others then raise notice 'T20b authenticated em crm_run_automations: %', sqlerrm; end; end $$;
do $$ begin begin perform public._crm_audience((select id from organizations limit 1),'visitaram',null,60,null); raise notice 'T20c RUIM'; exception when others then raise notice 'T20c authenticated em _crm_audience: %', sqlerrm; end; end $$;
do $$ begin begin perform public._crm_render('a','{}'::jsonb); raise notice 'T20d RUIM'; exception when others then raise notice 'T20d authenticated em _crm_render: %', sqlerrm; end; end $$;
do $$ begin begin perform * from public.crm_sends; raise notice 'T20e gestor le crm_sends: ok'; exception when others then raise notice 'T20e RUIM %', sqlerrm; end; end $$;
reset role;
set local role anon;
do $$ begin begin perform public.crm_overview(); raise notice 'T21 RUIM'; exception when others then raise notice 'T21 anon crm_overview: %', sqlerrm; end; end $$;
do $$ begin begin perform * from public.crm_sends; raise notice 'T21b RUIM'; exception when others then raise notice 'T21b anon le crm_sends: %', sqlerrm; end; end $$;
reset role;

-- modelo personalizado de cancelamento/confirmacao
select id as rid from reservations where protocol = 'C5F' \gset
select 'T22 sem modelo' t, public._crm_transactional_text('cancelamento', :'rid', 'Casa cheia') is null sem_texto;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.crm_template_save('cancelamento', E'Oi {{nome}}, sua reserva de {{dia}} às {{hora}} no {{unidade}} foi cancelada.\nMotivo: {{motivo}}\nProtocolo {{protocolo}}');
reset role;
select 'T22b com modelo+motivo' t, public._crm_transactional_text('cancelamento', :'rid', 'Casa cheia') r;
select 'T22c com modelo sem motivo' t, public._crm_transactional_text('cancelamento', :'rid', null) r;
select 'T22d confirmacao sem modelo' t, public._crm_transactional_text('confirmacao', :'rid', null) is null sem_texto;
rollback;
