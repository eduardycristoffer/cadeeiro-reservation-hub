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

-- r1 entra | r2 visitou há 20 dias | r3 é de Anápolis | r4 saiu (SAIR) | r5 sem autorização | r6 SAC aberto
-- r7 tem reserva futura (entra) | r8 recebeu pedido há 30 dias | r9 recebeu pedido há 100 dias (entra) | r10 reserva só confirmada (não veio)
-- r11 SAC já resolvido (entra)
insert into customers(id,organization_id,full_name,phone_e164,whatsapp_opt_in,whatsapp_opt_out_at) values
 ('00000000-0000-0000-0000-0000000001e1',:'org','ana souza','5562990000001',true,null),
 ('00000000-0000-0000-0000-0000000001e2',:'org','Bruno Lima','5562990000002',true,null),
 ('00000000-0000-0000-0000-0000000001e3',:'org','Carla Dias','5562990000003',true,null),
 ('00000000-0000-0000-0000-0000000001e4',:'org','Diego Reis','5562990000004',false,now()),
 ('00000000-0000-0000-0000-0000000001e5',:'org','Eva Neri','5562990000005',false,null),
 ('00000000-0000-0000-0000-0000000001e6',:'org','Fábio Cruz','5562990000006',true,null),
 ('00000000-0000-0000-0000-0000000001e7',:'org','Gabi Luz','5562990000007',true,null),
 ('00000000-0000-0000-0000-0000000001e8',:'org','Hugo Sá','5562990000008',true,null),
 ('00000000-0000-0000-0000-0000000001e9',:'org','Iara Paz','5562990000009',true,null),
 ('00000000-0000-0000-0000-000000000110',:'org','João Reis','5562990000010',true,null),
 ('00000000-0000-0000-0000-000000000111',:'org','Kátia Sol','5562990000011',true,null);
insert into reservations(protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('V1',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e1',current_date-3,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V2',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e2',current_date-20,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V3',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000001e3',current_date-3,'12:00',2,'telefone','concluida','rodizio_carnes'),
 ('V4',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e4',current_date-2,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V5',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e5',current_date-2,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V6',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e6',current_date-2,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V7',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e7',current_date-2,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V7F',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e7',current_date+4,'20:00',2,'telefone','confirmada','rodizio_pizza'),
 ('V8',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e8',current_date-2,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V9',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e9',current_date-2,'20:00',2,'telefone','concluida','rodizio_pizza'),
 ('V10',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000110',current_date-2,'20:00',2,'telefone','confirmada','rodizio_pizza'),
 ('V11',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000111',current_date-2,'20:00',2,'telefone','concluida','rodizio_pizza');
insert into sac_tickets(protocol,organization_id,unit_id,customer_id,category,subject,status) values
 ('SAC-T1',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000001e6','reclamacao','Demora no atendimento','aberto'),
 ('SAC-T2',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000111','reclamacao','Pedido trocado','resolvido');
-- pedidos de avaliação anteriores (inseridos como dono do banco)
insert into crm_sends(organization_id,kind,customer_id,unit_id,phone_e164,first_name,text,status,sent_at,created_at) values
 (:'org','avaliacao_google','00000000-0000-0000-0000-0000000001e8','00000000-0000-0000-0000-0000000000a1','5562990000008','Hugo','Avalie nos',  'enviado', now()-interval '30 days', now()-interval '30 days'),
 (:'org','avaliacao_google','00000000-0000-0000-0000-0000000001e9','00000000-0000-0000-0000-0000000000a1','5562990000009','Iara','Avalie nos',  'enviado', now()-interval '100 days', now()-interval '100 days');

-- janela de envio larga para o teste não depender do relógio
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.crm_settings_save('{"send_window_start":"00:00","send_window_end":"23:59","daily_cap":100}'::jsonb);

select 'T1 público GO 14d (esperado 4: Ana, Gabi, Iara, Kátia)' t, public.crm_audience_preview('recentes','00000000-0000-0000-0000-0000000000a1',14) r;
select 'T1b GO 30d (+Bruno)' t, (public.crm_audience_preview('recentes','00000000-0000-0000-0000-0000000000a1',30)->>'total')::int total;
select 'T1c AN 14d' t, (public.crm_audience_preview('recentes','00000000-0000-0000-0000-0000000000a2',14)->>'total')::int total;
select 'T1d dias fora de faixa vira 90' t, (public.crm_audience_preview('recentes','00000000-0000-0000-0000-0000000000a1',1000)->>'total')::int total;
reset role;

-- permissões
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin begin perform public.crm_review_campaign_launch('x1','00000000-0000-0000-0000-0000000000a2','https://g.page/r/abc/review','Oi {{nome}} avalie {{link_avaliacao}}',14); raise notice 'T2 RUIM'; exception when others then raise notice 'T2 funcionário lança: %', sqlerrm; end; end $$;
reset role;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$ begin begin perform public.crm_review_campaign_launch('x2','00000000-0000-0000-0000-0000000000a1','https://g.page/r/abc/review','Oi {{nome}} avalie {{link_avaliacao}}',14); raise notice 'T2b RUIM'; exception when others then raise notice 'T2b gestor AN lança GO: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_audience_preview('recentes','00000000-0000-0000-0000-0000000000a1',14); raise notice 'T2c RUIM'; exception when others then raise notice 'T2c gestor AN vê público GO: %', sqlerrm; end; end $$;
do $$ begin begin perform public._crm_review_url_ok('https://g.page/r/abc'); raise notice 'T2d RUIM'; exception when others then raise notice 'T2d função interna: %', sqlerrm; end; end $$;
reset role;

-- validações
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ declare u text; begin
  foreach u in array array['http://g.page/r/abc','https://g.page.evil.com/r/abc','https://evil.com/g.page/r/abc','https://g.page@evil.com/r','https://google.com.evil.com/x','javascript:alert(1)','https://g.page/r/ a b','https://g.page/{{nome}}',''] loop
    begin
      perform public.crm_review_campaign_launch('Valida','00000000-0000-0000-0000-0000000000a1',u,'Oi {{nome}} avalie {{link_avaliacao}}',14);
      raise notice 'T3 [%] ACEITOU (RUIM)', u;
    exception when others then raise notice 'T3 [%] -> %', u, sqlerrm; end;
  end loop;
end $$;
do $$ begin begin perform public.crm_review_campaign_launch('Sem unidade',null,'https://g.page/r/abc','Oi {{nome}} avalie {{link_avaliacao}}',14); raise notice 'T3b RUIM'; exception when others then raise notice 'T3b sem unidade: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_review_campaign_launch('Sem link','00000000-0000-0000-0000-0000000000a1','https://g.page/r/abc','Oi {{nome}} avalie por favor',14); raise notice 'T3c RUIM'; exception when others then raise notice 'T3c texto sem {{link_avaliacao}}: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_review_campaign_launch('Dias 0','00000000-0000-0000-0000-0000000000a1','https://g.page/r/abc','Oi {{nome}} avalie {{link_avaliacao}}',0); raise notice 'T3d RUIM'; exception when others then raise notice 'T3d dias 0: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_review_campaign_launch('Dias 91','00000000-0000-0000-0000-0000000000a1','https://g.page/r/abc','Oi {{nome}} avalie {{link_avaliacao}}',91); raise notice 'T3e RUIM'; exception when others then raise notice 'T3e dias 91: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_review_campaign_launch('X','00000000-0000-0000-0000-0000000000a1','https://g.page/r/abc','Oi {{nome}} avalie {{link_avaliacao}}',14); raise notice 'T3f RUIM'; exception when others then raise notice 'T3f nome curto: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_review_campaign_launch('Variável','00000000-0000-0000-0000-0000000000a1','https://g.page/r/abc','Oi {{Nome}} avalie {{link_avaliacao}}',14); raise notice 'T3g RUIM'; exception when others then raise notice 'T3g variável maiúscula: %', sqlerrm; end; end $$;
do $$ begin begin perform public.crm_review_campaign_launch('Vazio','00000000-0000-0000-0000-0000000000a2','https://g.page/r/abc','Oi {{nome}} avalie {{link_avaliacao}}',1); raise notice 'T3h RUIM'; exception when others then raise notice 'T3h público vazio: %', sqlerrm; end; end $$;
reset role;
select 'T3i nada foi enfileirado pelas tentativas inválidas' t, (select count(*) from crm_campaigns) campanhas, (select count(*) from crm_sends where campaign_id is not null) envios;

-- lançamento
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T4 lança GO 14d' t, public.crm_review_campaign_launch('Avaliação Goiânia Nov/26','00000000-0000-0000-0000-0000000000a1','https://g.page/r/CabC123/review',E'Oi, {{nome}}! Avalie o {{unidade}}:\n{{link_avaliacao}}',14) r;
select 'T4b campanha' t, kind, audience, days, review_url, status, total, (select slug from crm_campaigns limit 1) slug from crm_campaigns;
select 'T4c envios' t, first_name, kind, status, text, round(extract(epoch from scheduled_for - (select min(scheduled_for) from crm_sends where campaign_id is not null))) seg
  from crm_sends where campaign_id is not null order by scheduled_for;
do $$ begin begin perform public.crm_review_campaign_launch('Repete','00000000-0000-0000-0000-0000000000a1','https://g.page/r/CabC123/review','Oi {{nome}} avalie {{link_avaliacao}}',14); raise notice 'T4d RUIM'; exception when others then raise notice 'T4d repetir logo em seguida: %', sqlerrm; end; end $$;
select 'T4e remarketing agora pula quem recebeu avaliação (intervalo de marketing)' t, (public.crm_audience_preview('visitaram','00000000-0000-0000-0000-0000000000a1',60)->>'total')::int total, public.crm_audience_preview('visitaram','00000000-0000-0000-0000-0000000000a1',60)->'sample' sample;
select 'T4f auditoria' t, action, entity_type from audit_log where action like 'crm.avaliacao%' order by created_at;
reset role;

-- fila: o n8n recebe o tipo certo e a campanha conclui (os envios saem 15s um do outro; aqui todos vencem agora)
update crm_sends set scheduled_for = now() where campaign_id is not null;
select 'T5 due (esperado 4)' t, jsonb_array_length(public.sdr_crm_sends_due(10, null)) n;
select 'T5a segunda consulta vem vazia' t, public.sdr_crm_sends_due(10, null) r;
select 'T5b status' t, status, count(*) from crm_sends where campaign_id is not null group by status;
do $$ declare s record; begin
  for s in select id from crm_sends where campaign_id is not null and status = 'enviando' loop perform public.sdr_mark_crm_send(s.id, true, null); end loop;
end $$;
select 'T5c campanha concluída' t, status from crm_campaigns;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T5d overview' t, public.crm_overview()->'by_kind_7d' by_kind;
do $$ begin begin perform public.crm_review_campaign_launch('Depois de enviar','00000000-0000-0000-0000-0000000000a1','https://g.page/r/CabC123/review','Oi {{nome}} avalie {{link_avaliacao}}',14); raise notice 'T5e RUIM'; exception when others then raise notice 'T5e já recebeu (enviado): %', sqlerrm; end; end $$;
reset role;

-- cancelamento (para simular "ninguém recebeu" os envios da primeira campanha viram cancelados, como se ela tivesse sido cancelada)
update crm_sends set status = 'cancelado' where campaign_id is not null;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T6b público voltou (4)' t, (public.crm_audience_preview('recentes','00000000-0000-0000-0000-0000000000a1',14)->>'total')::int total;
select 'T6c segundo lançamento' t, public.crm_review_campaign_launch('Segunda rodada','00000000-0000-0000-0000-0000000000a1','https://share.google/AbC123','Oi {{nome}}, avalie {{link_avaliacao}}',14)->>'queued' queued;
select 'T6d cancela campanha' t, public.crm_campaign_cancel((select id from crm_campaigns where name = 'Segunda rodada')) cancelados;
select 'T6e auditoria do cancelamento' t, action from audit_log where action like 'crm.avaliacao_cancelada';
reset role;

-- modelos
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T7 modelos' t, jsonb_array_length(public.crm_templates_list()) n, (select e->>'key' from jsonb_array_elements(public.crm_templates_list()) e where e->>'key'='avaliacao_google') chave,
       (select (e->>'body') like '%{{link_avaliacao}}%' from jsonb_array_elements(public.crm_templates_list()) e where e->>'key'='avaliacao_google') tem_link;
do $$ begin begin perform public.crm_template_save('avaliacao_google','Oi {{nome}}, avalie por favor ok'); raise notice 'T7b RUIM'; exception when others then raise notice 'T7b modelo sem link: %', sqlerrm; end; end $$;
select public.crm_template_save('avaliacao_google','Oi {{nome}}! Avalie o {{unidade}}: {{link_avaliacao}}');
select 'T7c modelo salvo' t, (select e->>'body' from jsonb_array_elements(public.crm_templates_list()) e where e->>'key'='avaliacao_google') body;
reset role;

-- trava no banco (mesmo para o dono): campanha de avaliação sem link/unidade não existe
do $$ begin begin insert into crm_campaigns(organization_id,name,slug,audience,body,kind) values ((select id from organizations limit 1),'Sem link','avl-x','recentes','Oi {{nome}} {{link_avaliacao}}','avaliacao_google'); raise notice 'T8 RUIM'; exception when check_violation then raise notice 'T8 sem link/unidade: check_violation'; end; end $$;
do $$ begin begin insert into crm_campaigns(organization_id,name,slug,audience,body,kind,review_url,unit_id) values ((select id from organizations limit 1),'Http','avl-y','recentes','Oi {{nome}} {{link_avaliacao}}','avaliacao_google','http://g.page/x','00000000-0000-0000-0000-0000000000a1'); raise notice 'T8b RUIM'; exception when check_violation then raise notice 'T8b link http: check_violation'; end; end $$;
-- variável {{link_avaliacao}} vazia some a linha (sem link nunca sai "{{...}}" no texto)
select 'T9 sem link some a linha' t, public._crm_render(E'Oi {{nome}}\nAvalie: {{link_avaliacao}}\nObrigado', '{"nome":"Ana"}'::jsonb) r;
select 'T9b domínios' t, public._crm_review_url_ok('https://g.page/r/abc/review') g_page, public._crm_review_url_ok('https://search.google.com/local/writereview?placeid=ChIJ123') writereview,
       public._crm_review_url_ok('https://maps.app.goo.gl/AbC') maps, public._crm_review_url_ok('https://share.google/H50r74dqSvM6YCwXu') share, public._crm_review_url_ok('https://www.google.com.br/maps/place/x') br,
       public._crm_review_url_ok('https://facebook.com/x') fora;
rollback;
