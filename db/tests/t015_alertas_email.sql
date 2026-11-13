-- Cenários da migração 015 (alertas + e-mail). Cada bloco usa ASSERT: se algo quebrar, o psql para com erro.
\set ON_ERROR_STOP on
select id as org from organizations limit 1 \gset
begin;
insert into units(id,organization_id,name,slug,city,services) values
 ('00000000-0000-0000-0000-0000000000a1',:'org','Candeeiro Goiânia','goiania','Goiânia','{almoco_quilo,rodizio_pizza}'),
 ('00000000-0000-0000-0000-0000000000a2',:'org','Candeeiro Anápolis','anapolis','Anápolis','{rodizio_carnes,rodizio_pizza}');
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000b1','gestor@x.com'),   -- gestor GO+AN
 ('00000000-0000-0000-0000-0000000000b2','func-an@x.com'),  -- funcionario AN
 ('00000000-0000-0000-0000-0000000000b3','gestor-an@x.com'),-- gestor AN
 ('00000000-0000-0000-0000-0000000000b4','dono@x.com'),     -- super admin
 ('00000000-0000-0000-0000-0000000000b5','func-go@x.com');  -- funcionario GO
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

-- T1: reserva nova vinda do site (sem usuário logado) -> alerta + e-mail para gestor GO, funcionário GO e dono
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c1','R1',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date+2,'20:00',4,'landing_page','pendente','rodizio_pizza');
do $$ declare n record; mails text[]; begin
  select * into n from notifications where entity_id='00000000-0000-0000-0000-0000000000c1';
  assert n.kind='reserva_pendente' and n.severity='info', 'T1 tipo';
  assert n.body like 'Maria · 4 pessoas · %Candeeiro Goiânia', 'T1 corpo: '||n.body;
  assert n.link='/admin/aprovacoes', 'T1 link';
  select array_agg(to_email order by to_email) into mails from email_outbox where notification_id=n.id;
  assert mails = array['dono@x.com','func-go@x.com','gestor@x.com'], 'T1 destinatários: '||mails::text;
  raise notice 'T1 ok: %', mails;
end $$;

-- T2: não duplica
do $$ begin
  assert public._notify('reserva_pendente','00000000-0000-0000-0000-0000000000a1','info','x','y','/admin/aprovacoes','00000000-0000-0000-0000-0000000000c1') is null, 'T2 duplicou';
  assert (select count(*) from email_outbox) = 3, 'T2 e-mails duplicados';
  raise notice 'T2 ok: sem duplicar';
end $$;

-- T3: grupo grande -> só gestor GO e dono (funcionário não aprova grupo grande)
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service,is_large_group) values
 ('00000000-0000-0000-0000-0000000000c2','R2',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date+5,'20:00',40,'landing_page','pendente','rodizio_pizza',true);
do $$ declare n record; mails text[]; begin
  select * into n from notifications where entity_id='00000000-0000-0000-0000-0000000000c2';
  assert n.kind='grupo_grande' and n.severity='atencao', 'T3 tipo';
  select array_agg(to_email order by to_email) into mails from email_outbox where notification_id=n.id;
  assert mails = array['dono@x.com','gestor@x.com'], 'T3 destinatários: '||mails::text;
  raise notice 'T3 ok: %', mails;
end $$;

-- T4: reserva criada por pessoa logada no painel não gera alerta
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b5';
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c3','R3',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date+2,'19:00',2,'painel','pendente','rodizio_pizza');
set local request.jwt.claim.sub = '';
do $$ begin
  assert not exists (select 1 from notifications where entity_id='00000000-0000-0000-0000-0000000000c3'), 'T4 alertou reserva do painel';
  raise notice 'T4 ok: reserva do painel não alerta';
end $$;

-- T5: cancelamento pelo cliente (sem usuário) com motivo; cancelamento pelo painel não alerta
select set_config('app.status_note','Cancelada pelo cliente via WhatsApp: Surgiu um imprevisto no trabalho', true);
update reservations set status='cancelada' where id='00000000-0000-0000-0000-0000000000c1';
select set_config('app.status_note','', true);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
update reservations set status='cancelada' where id='00000000-0000-0000-0000-0000000000c3';
set local request.jwt.claim.sub = '';
do $$ declare n record; begin
  select * into n from notifications where kind='reserva_cancelada' and entity_id='00000000-0000-0000-0000-0000000000c1';
  assert n.id is not null and n.severity='info', 'T5 cancelamento com folga = info';
  assert n.body like '%Motivo: Surgiu um imprevisto no trabalho%', 'T5 motivo: '||n.body;
  assert not exists (select 1 from notifications where kind='reserva_cancelada' and entity_id='00000000-0000-0000-0000-0000000000c3'), 'T5 alertou cancelamento do painel';
  raise notice 'T5 ok: %', n.body;
end $$;

-- T5b: cancelamento para amanhã pede atenção (a mesa já estava reservada para logo)
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c7','R7',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date+1,'20:00',2,'landing_page','confirmada','rodizio_pizza');
update reservations set status='cancelada' where id='00000000-0000-0000-0000-0000000000c7';
do $$ begin
  assert (select severity from notifications where kind='reserva_cancelada' and entity_id='00000000-0000-0000-0000-0000000000c7')='atencao', 'T5b amanhã = atenção';
  raise notice 'T5b ok';
end $$;

-- T6: SAC urgente / cliente pediu atendente
insert into sac_tickets(id,protocol,organization_id,unit_id,customer_id,category,subject,priority,human_requested,origin) values
 ('00000000-0000-0000-0000-0000000000d1','S1',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1','reclamacao','Demora no atendimento','urgente',false,'sdr_whatsapp'),
 ('00000000-0000-0000-0000-0000000000d2','S2',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1','duvida','Quer falar com alguém','media',true,'sdr_whatsapp');
do $$ declare mails text[]; begin
  assert (select severity from notifications where entity_id='00000000-0000-0000-0000-0000000000d1')='urgente', 'T6 urgente';
  assert (select title from notifications where entity_id='00000000-0000-0000-0000-0000000000d2')='Cliente pediu um atendente', 'T6 atendente';
  select array_agg(to_email order by to_email) into mails from email_outbox o join notifications n on n.id=o.notification_id where n.entity_id='00000000-0000-0000-0000-0000000000d1';
  assert mails = array['dono@x.com','func-an@x.com','gestor-an@x.com','gestor@x.com'], 'T6 destinatários AN: '||mails::text;
  raise notice 'T6 ok: %', mails;
end $$;

-- T7: lead do WhatsApp -> sino sim, e-mail não (padrão desligado)
insert into whatsapp_leads(id,organization_id,customer_id,unit_id,city,full_name,phone_e164,source,campaign) values
 ('00000000-0000-0000-0000-0000000000f1',:'org','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','goiania','Maria Souza','5562990000001','campanha','black-friday');
do $$ declare n record; begin
  select * into n from notifications where entity_id='00000000-0000-0000-0000-0000000000f1';
  assert n.kind='lead_whatsapp' and n.body like 'Maria · Goi% · black-friday', 'T7 corpo: '||coalesce(n.body,'(nulo)');
  assert not exists (select 1 from email_outbox where notification_id=n.id), 'T7 mandou e-mail de lead';
  raise notice 'T7 ok: lead no sino, sem e-mail';
end $$;

-- T8: falha de envio da confirmação -> só gestores (e dono) da unidade
insert into message_outbox(id,organization_id,reservation_id,event_key,dedupe_key,status,error) values
 ('00000000-0000-0000-0000-0000000000a9',:'org','00000000-0000-0000-0000-0000000000c2','reserva_confirmada','t8-a','pendente',null);
update message_outbox set status='falhou', error='sem_conversa' where id='00000000-0000-0000-0000-0000000000a9';
update message_outbox set status='falhou', error='outra vez' where id='00000000-0000-0000-0000-0000000000a9';
do $$ declare n record; mails text[]; begin
  select * into n from notifications where kind='falha_envio' and entity_id='00000000-0000-0000-0000-0000000000a9';
  assert n.id is not null and n.severity='urgente' and n.body like 'Reserva R2 · sem_conversa', 'T8 alerta: '||coalesce(n.body,'(nulo)');
  select array_agg(to_email order by to_email) into mails from email_outbox where notification_id=n.id;
  assert mails = array['dono@x.com','gestor@x.com'], 'T8 destinatários: '||mails::text;
  raise notice 'T8 ok: %', mails;
end $$;

-- T9: quem desliga o e-mail no perfil deixa de receber (o sino continua)
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b5';
select public.notification_prefs_set(false);
do $$ begin assert (public.notification_prefs_get()->>'email_alerts')::boolean = false, 'T9 prefs'; end $$;
reset role; set local request.jwt.claim.sub = '';
do $$ begin
  assert not exists (select 1 from public._notif_recipients((select organization_id from units limit 1),'sac_novo','00000000-0000-0000-0000-0000000000a1') where email='func-go@x.com'), 'T9 ainda recebe';
  raise notice 'T9 ok: opt-out respeitado';
end $$;

-- T10: configuração (só gestor): desligar um tipo, e-mails extras, validação
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin begin perform public.notification_settings_get(); raise exception 'T10 funcionário leu'; exception when others then assert sqlerrm='FORBIDDEN', 'T10 func: '||sqlerrm; end; end $$;
do $$ begin begin perform public.email_test_enqueue(); raise exception 'T10 funcionário testou'; exception when others then assert sqlerrm='FORBIDDEN', 'T10 func teste: '||sqlerrm; end; end $$;
reset role;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (public.notification_settings_get()->'email_kinds'->>'lead_whatsapp')::boolean = false, 'T10 padrão lead';
  assert (public.notification_settings_get()->'email_kinds'->>'sac_novo')::boolean = true, 'T10 padrão sac';
  begin perform public.notification_settings_save('{"extra_emails":["nao-e-email"]}'); raise exception 'T10 aceitou e-mail inválido'; exception when others then assert sqlerrm='INVALID_EMAIL', 'T10 email: '||sqlerrm; end;
  begin perform public.notification_settings_save('{"email_kinds":{"xpto":true}}'); raise exception 'T10 aceitou tipo'; exception when others then assert sqlerrm='INVALID_SETTINGS', 'T10 tipo: '||sqlerrm; end;
  begin perform public.notification_settings_save('{"email_kinds":{"sac_novo":"sim"}}'); raise exception 'T10 aceitou texto'; exception when others then assert sqlerrm='INVALID_SETTINGS', 'T10 texto: '||sqlerrm; end;
  perform public.notification_settings_save('{"email_kinds":{"sac_novo":false},"extra_emails":["Dono@Rede.com.br","dono@rede.com.br"]}');
  assert (public.notification_settings_get()->'email_kinds'->>'sac_novo')::boolean = false, 'T10 sac desligado';
  assert public.notification_settings_get()->'extra_emails' = '["dono@rede.com.br"]'::jsonb, 'T10 extras: '||(public.notification_settings_get()->'extra_emails')::text;
  perform public.email_test_enqueue();
  raise notice 'T10 ok';
end $$;
reset role; set local request.jwt.claim.sub = '';
do $$ begin
  assert exists (select 1 from email_outbox where kind='teste' and to_email='gestor@x.com'), 'T10 teste enfileirado';
  assert exists (select 1 from audit_log where action='alertas.config_salva'), 'T10 auditoria';
end $$;

-- T11: SAC com tipo desligado -> sino sim, e-mail não; extra recebe os tipos ligados
insert into sac_tickets(id,protocol,organization_id,unit_id,customer_id,category,subject,priority,origin) values
 ('00000000-0000-0000-0000-0000000000d3','S3',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1','elogio','Atendimento ótimo','baixa','sdr_whatsapp');
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c4','R4',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1',current_date+2,'20:00',3,'landing_page','pendente','rodizio_pizza');
do $$ declare n uuid; begin
  select id into n from notifications where entity_id='00000000-0000-0000-0000-0000000000d3';
  assert n is not null and not exists (select 1 from email_outbox where notification_id=n), 'T11 sac sem e-mail';
  assert exists (select 1 from email_outbox o join notifications x on x.id=o.notification_id where x.entity_id='00000000-0000-0000-0000-0000000000c4' and o.to_email='dono@rede.com.br'), 'T11 extra recebe';
  raise notice 'T11 ok';
end $$;

-- T12: e-mail geral desligado -> só o sino
update notification_settings set email_enabled=false;
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c5','R5',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1',current_date+3,'20:00',3,'landing_page','pendente','rodizio_pizza');
do $$ begin
  assert exists (select 1 from notifications where entity_id='00000000-0000-0000-0000-0000000000c5'), 'T12 sino';
  assert not exists (select 1 from email_outbox o join notifications x on x.id=o.notification_id where x.entity_id='00000000-0000-0000-0000-0000000000c5'), 'T12 e-mail com tudo desligado';
  raise notice 'T12 ok';
end $$;
update notification_settings set email_enabled=true;

-- T13: visibilidade (RLS) e leitura
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b5';  -- funcionário GO
do $$ begin
  assert exists (select 1 from notifications where entity_id='00000000-0000-0000-0000-0000000000c1'), 'T13 func GO vê reserva GO';
  assert not exists (select 1 from notifications where kind in ('grupo_grande','falha_envio')), 'T13 func não vê grupo grande/falha';
  assert not exists (select 1 from notifications where unit_id='00000000-0000-0000-0000-0000000000a2'), 'T13 func GO vê AN';
  raise notice 'T13a ok: func GO enxerga % alertas', (select count(*) from notifications);
end $$;
reset role;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';  -- gestor AN
do $$ begin
  assert not exists (select 1 from notifications where unit_id='00000000-0000-0000-0000-0000000000a1'), 'T13 gestor AN vê GO';
  assert exists (select 1 from notifications where kind='sac_novo' and unit_id='00000000-0000-0000-0000-0000000000a2'), 'T13 gestor AN não vê AN';
  raise notice 'T13b ok';
end $$;
reset role;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';  -- gestor GO+AN
do $$ declare before int; after int; begin
  before := public.notifications_unread_count();
  assert before > 0, 'T13 contador';
  perform public.notifications_mark_read((select array_agg(id) from (select id from notifications order by created_at limit 2) z));
  after := public.notifications_unread_count();
  assert after = before - 2, 'T13 marcar 2: '||before||'->'||after;
  perform public.notifications_mark_read(null);
  assert public.notifications_unread_count() = 0, 'T13 marcar tudo';
  raise notice 'T13c ok: % -> % -> 0', before, after;
end $$;
reset role;
-- gestor GO+AN não lê leitura de outra pessoa
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$ begin assert not exists (select 1 from notification_reads where user_id <> auth.uid()), 'T13 leituras alheias'; assert public.notifications_unread_count() > 0, 'T13 contador do outro'; end $$;
reset role;

-- T14: fila de e-mails para o servidor (claim / mark / tentativas)
do $$ declare c jsonb; id1 uuid; n int; begin
  update email_outbox set scheduled_for=now() - interval '1 minute';
  c := public.sdr_email_claim(3);
  assert jsonb_array_length(c) = 3, 'T14 claim 3: '||jsonb_array_length(c);
  assert (c->0->>'to') like '%@%' and (c->0->>'subject') like '[Candeeiro]%', 'T14 campos';
  assert (select count(*) from email_outbox where status='enviando') = 3, 'T14 status enviando';
  id1 := (c->0->>'id')::uuid;
  perform public.sdr_email_mark(id1, true, null);
  assert (select status from email_outbox where id=id1)='enviado' and (select sent_at from email_outbox where id=id1) is not null, 'T14 enviado';
  perform public.sdr_email_mark((c->1->>'id')::uuid, false, 'Resend 429');
  assert (select status from email_outbox where id=(c->1->>'id')::uuid)='pendente' and (select scheduled_for from email_outbox where id=(c->1->>'id')::uuid) > now(), 'T14 reagendado';
  begin perform public.sdr_email_mark(id1, true, null); raise exception 'T14 marcou duas vezes'; exception when others then assert sqlerrm='NOT_FOUND', 'T14 2x: '||sqlerrm; end;
  -- 4ª falha vira "falhou"
  update email_outbox set attempts=4, status='enviando' where id=(c->2->>'id')::uuid;
  perform public.sdr_email_mark((c->2->>'id')::uuid, false, 'rejeitado');
  assert (select status from email_outbox where id=(c->2->>'id')::uuid)='falhou', 'T14 falhou';
  -- preso em "enviando" há muito tempo volta para a fila
  update email_outbox set status='enviando', attempts=1, updated_at=now()-interval '20 minutes' where id=(c->1->>'id')::uuid;
  perform public.sdr_email_claim(1);
  assert (select attempts from email_outbox where id=(c->1->>'id')::uuid) >= 1, 'T14 preso';
  raise notice 'T14 ok';
end $$;

-- T15: limpeza automática
do $$ begin
  update email_outbox set status='enviado', updated_at=now()-interval '31 days' where id=(select id from email_outbox where status='enviado' limit 1);
  update notifications set created_at=now()-interval '91 days' where id=(select id from notifications order by created_at limit 1);
  perform public.sdr_email_claim(1);
  assert (select count(*) from email_outbox where status='enviado' and updated_at < now()-interval '30 days') = 0, 'T15 e-mail antigo';
  assert (select count(*) from notifications where created_at < now()-interval '90 days') = 0, 'T15 alerta antigo';
  raise notice 'T15 ok';
end $$;

-- T16: permissões
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  begin perform public.sdr_email_claim(1); raise exception 'T16 claim liberado'; exception when insufficient_privilege then null; end;
  begin perform public.sdr_email_mark(gen_random_uuid(), true); raise exception 'T16 mark liberado'; exception when insufficient_privilege then null; end;
  begin perform public._notify('sac_novo', null, 'info', 'x', 'y', null, null); raise exception 'T16 _notify liberado'; exception when insufficient_privilege then null; end;
  begin perform * from public._notif_recipients(gen_random_uuid(), 'sac_novo', null); raise exception 'T16 recipients liberado'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.email_outbox limit 1; raise exception 'T16 outbox legível'; exception when insufficient_privilege then null; end;
  begin insert into public.notifications(organization_id,kind,title) values (gen_random_uuid(),'sac_novo','x'); raise exception 'T16 inseriu alerta'; exception when insufficient_privilege then null; end;
  begin insert into public.notification_reads(notification_id,user_id) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3'); raise exception 'T16 leitura em nome de outro'; exception when insufficient_privilege or foreign_key_violation or check_violation then null; end;
  raise notice 'T16a ok (authenticated)';
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.notifications limit 1; raise exception 'T16 anon lê alertas'; exception when insufficient_privilege then null; end;
  begin perform public.notifications_unread_count(); raise exception 'T16 anon contador'; exception when insufficient_privilege then null; end;
  begin perform public.notification_settings_get(); raise exception 'T16 anon settings'; exception when insufficient_privilege then null; end;
  raise notice 'T16b ok (anon)';
end $$;
reset role;

-- T17: um erro dentro do alerta NUNCA derruba a reserva
create or replace function public._notify(_kind text, _unit uuid, _severity text, _title text, _body text, _link text, _entity uuid)
returns uuid language plpgsql as $$ begin raise exception 'boom'; end $$;
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('00000000-0000-0000-0000-0000000000c6','R6',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date+4,'20:00',2,'landing_page','pendente','rodizio_pizza');
do $$ begin assert exists (select 1 from reservations where protocol='R6'), 'T17 reserva perdida'; raise notice 'T17 ok: reserva salva mesmo com falha no alerta'; end $$;
rollback;
