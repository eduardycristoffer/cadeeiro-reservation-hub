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
-- precos: pizza Goiania 79,90 todos os dias
insert into price_tables(id,unit_id,name) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','Tabela');
insert into price_rules(table_id,service,weekdays,amount) values ('00000000-0000-0000-0000-0000000000d1','rodizio_pizza','{0,1,2,3,4,5,6}',79.90);
update site_settings set quilo_avg_ticket = 45 where organization_id=:'org';
insert into site_settings(organization_id,quilo_avg_ticket) values (:'org',45) on conflict (organization_id) do update set quilo_avg_ticket=45;

-- clientes e reservas (data de criacao = hoje)
insert into customers(id,organization_id,full_name,phone_e164) values
 ('00000000-0000-0000-0000-0000000000e1',:'org','Cli Um','5562990000001'),('00000000-0000-0000-0000-0000000000e2',:'org','Cli Dois','5562990000002'),
 ('00000000-0000-0000-0000-0000000000e3',:'org','Cli Tres','5562990000003'),('00000000-0000-0000-0000-0000000000e4',:'org','Cli Quatro','5562990000004');
-- e3 ja era cliente (reserva antiga sem campanha) -> nao e "novo"
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service,campaign,created_at) values
 ('00000000-0000-0000-0000-0000000000f0','OLD',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e3',current_date-60,'12:00',2,'telefone','concluida','rodizio_pizza',null,now()-interval '60 days');
insert into reservations(id,protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service,campaign) values
 ('00000000-0000-0000-0000-0000000000f1','R1',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',current_date+2,'12:00',4,'landing_page','confirmada','rodizio_pizza','black-friday'),
 ('00000000-0000-0000-0000-0000000000f2','R2',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e2',current_date+2,'13:00',2,'landing_page','confirmada','almoco_quilo','black-friday'),
 ('00000000-0000-0000-0000-0000000000f3','R3',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e3',current_date+2,'13:00',3,'landing_page','confirmada','rodizio_pizza','black-friday'),
 ('00000000-0000-0000-0000-0000000000f4','R4',:'org','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e4',current_date+2,'13:00',5,'landing_page','pendente','rodizio_carnes','pascoa'),
 ('00000000-0000-0000-0000-0000000000f5','R5',:'org','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e4',current_date+2,'14:00',2,'landing_page','cancelada','rodizio_pizza','black-friday');
-- leads
insert into whatsapp_leads(organization_id,unit_id,city,full_name,phone_e164,campaign,page_path) values (:'org','00000000-0000-0000-0000-0000000000a1','goiania','W1 Teste','5562991111111','black-friday','/'),(:'org','00000000-0000-0000-0000-0000000000a1','goiania','W2 Teste','5562991111112','black-friday','/');
insert into reservation_leads(organization_id,full_name,phone_e164,campaign,unit_id) values (:'org','L1','5562992222221','black-friday','00000000-0000-0000-0000-0000000000a1');

-- gestor (2 unidades) lanca gasto, orcamento e importa
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T1 spend_save' t, public.ad_spend_save(current_date,'meta','black-friday','00000000-0000-0000-0000-0000000000a1',120.50,1000,50,3,null) id;
select 'T1b upsert mesmo dia' t, public.ad_spend_save(current_date,'meta','black-friday','00000000-0000-0000-0000-0000000000a1',150.00,1200,60,3,null) id;
select 'T2 import' t, public.ad_spend_import(jsonb_build_array(
 jsonb_build_object('data',current_date-1,'plataforma','meta','campanha','black-friday','unidade','goiania','valor','100,00'),
 jsonb_build_object('data',current_date-1,'campanha','pascoa','unidade','anapolis','valor','60'),
 jsonb_build_object('data','2999-01-01','valor','5'),
 jsonb_build_object('data',current_date,'valor','abc'),
 jsonb_build_object('data',current_date,'unidade','curitiba','valor','5'))) r;
select 'T3 budget' t; select public.ad_budget_set(date_trunc('month',current_date)::date, null, '', 2000);
select public.ad_budget_set(date_trunc('month',current_date)::date, '00000000-0000-0000-0000-0000000000a1', 'black-friday', 800);
reset role;
select 'T4 gastos' t, spend_date, campaign, unit_id is not null as unid, amount from ad_spend order by spend_date, campaign;
-- relatorio
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T5 totals' t, jsonb_pretty(r->'totals') from (select public.report_ads(current_date-6, current_date) r) q;
select 'T5 metrics' t, jsonb_pretty(r->'metrics') from (select public.report_ads(current_date-6, current_date) r) q;
select 'T5 budget' t, r->'budget' from (select public.report_ads(current_date-6, current_date) r) q;
select 'T5 projection' t, jsonb_pretty(r->'projection') from (select public.report_ads(current_date-6, current_date) r) q;
select 'T5 by_campaign' t, jsonb_pretty(r->'by_campaign') from (select public.report_ads(current_date-6, current_date) r) q;
select 'T5 by_unit' t, r->'by_unit' from (select public.report_ads(current_date-6, current_date) r) q;
select 'T5 by_day(len)' t, jsonb_array_length(r->'by_day') from (select public.report_ads(current_date-6, current_date) r) q;
select 'T6 filtro campanha pascoa' t, r->'totals'->>'spend' spend, r->'metrics'->>'cac' cac from (select public.report_ads(current_date-6, current_date, null, 'pascoa') r) q;
reset role;
-- isolamento: gestor so de Anapolis
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
select 'T7 gestor anapolis totals' t, r->'totals'->>'spend' spend, r->'totals'->>'reservations' reservas, r->'totals'->>'wa_leads' wa from (select public.report_ads(current_date-6, current_date) r) q;
do $$ begin begin perform public.report_ads(current_date-6,current_date,'00000000-0000-0000-0000-0000000000a1'); raise notice 'T7b RUIM'; exception when others then raise notice 'T7b gestor an pede goiania: %', sqlerrm; end;
 begin perform public.ad_spend_save(current_date,'meta','x','00000000-0000-0000-0000-0000000000a1',1); raise notice 'T7c RUIM'; exception when others then raise notice 'T7c gestor an grava goiania: %', sqlerrm; end; end $$;
select 'T7d ve gasto' t, count(*) from ad_spend;
reset role;
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin begin perform public.report_ads(current_date-6,current_date); raise notice 'T8 RUIM'; exception when others then raise notice 'T8 funcionario: %', sqlerrm; end; end $$;
select 'T8b funcionario le gasto' t, count(*) from ad_spend;
reset role;
set local role anon;
do $$ begin begin perform public.report_ads(current_date-6,current_date); raise notice 'T9 RUIM'; exception when others then raise notice 'T9 anon: %', sqlerrm; end; end $$;
reset role;

-- campanha pages
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select 'T10 page' t, public.campaign_page_save(null,'black-friday-pizza','BF Pizza','reserva','Pizza em dobro','Só hoje','goiania','rodizio_pizza','','Reservar','Obrigado!',true) id;
do $$ begin begin perform public.campaign_page_save(null,'black-friday-pizza','Outra pagina','reserva','Titulo valido','','goiania','rodizio_pizza','','','',true); raise notice 'T10b RUIM'; exception when others then raise notice 'T10b dup: %', sqlerrm; end; end $$;
reset role;
set local role anon;
select 'T11 public page' t, public.public_campaign_page('black-friday-pizza') r;
select 'T11b inexistente' t, public.public_campaign_page('nao-existe') r;
reset role;
rollback;
