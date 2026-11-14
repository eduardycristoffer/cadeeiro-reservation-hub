-- t019: várias lojas (organizações), base de clientes (diretório, ficha, importação), perfil e alertas por tipo.
-- Falha (exit != 0) se qualquer verificação não bater.
select id as orgA from organizations order by created_at limit 1 \gset
begin;
insert into organizations(id,name,slug) values ('00000000-0000-0000-0000-00000000f0b1','Loja B','loja-b');
insert into units(id,organization_id,name,slug,city,services) values
 ('00000000-0000-0000-0000-0000000000a1',:'orga','Unidade A1','a1','Goiânia','{almoco_quilo}'),
 ('00000000-0000-0000-0000-0000000000a2',:'orga','Unidade A2','a2','Anápolis','{rodizio_carnes}'),
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-00000000f0b1','Unidade B1','b1','Brasília','{rodizio_pizza}');
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000c1','super@x.com'),('00000000-0000-0000-0000-0000000000c2','gestor-a1@x.com'),
 ('00000000-0000-0000-0000-0000000000c3','func-a1@x.com'),('00000000-0000-0000-0000-0000000000c4','gestor-b1@x.com');
update user_profiles set organization_id=:'orga', full_name='Super', is_active=true where id='00000000-0000-0000-0000-0000000000c1';
update user_profiles set organization_id=:'orga', full_name='Gestor A1', is_active=true where id='00000000-0000-0000-0000-0000000000c2';
update user_profiles set organization_id=:'orga', full_name='Func A1', is_active=true where id='00000000-0000-0000-0000-0000000000c3';
update user_profiles set organization_id='00000000-0000-0000-0000-00000000f0b1', full_name='Gestor B1', is_active=true where id='00000000-0000-0000-0000-0000000000c4';
delete from user_roles where user_id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000c4');
insert into user_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000c1','super_admin'),('00000000-0000-0000-0000-0000000000c2','gestor'),
 ('00000000-0000-0000-0000-0000000000c3','funcionario'),('00000000-0000-0000-0000-0000000000c4','gestor');
insert into user_unit_access(user_id,unit_id) values ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000a3');

insert into customers(id,organization_id,full_name,phone_e164,email) values
 ('00000000-0000-0000-0000-0000000002e1',:'orga','Ana A1','5562991110001',null),
 ('00000000-0000-0000-0000-0000000002e2',:'orga','Bia A2','5562991110002',null),
 ('00000000-0000-0000-0000-0000000002e3','00000000-0000-0000-0000-00000000f0b1','Caio B1','5561991110003',null),
 ('00000000-0000-0000-0000-0000000002e4',:'orga','Duda A1 e A2','5562991110004',null);
update customers set origin_unit_id='00000000-0000-0000-0000-0000000000a3', source='reserva_site' where id='00000000-0000-0000-0000-0000000002e3';
insert into reservations(protocol,organization_id,unit_id,customer_id,reservation_date,reservation_time,party_size,origin,status,service) values
 ('R1',:'orga','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000002e1',current_date-3,'12:00',2,'telefone','concluida','almoco_quilo'),
 ('R2',:'orga','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000002e2',current_date-3,'12:00',2,'telefone','concluida','rodizio_carnes'),
 ('R4A',:'orga','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000002e4',current_date-5,'12:00',3,'telefone','concluida','almoco_quilo'),
 ('R4B',:'orga','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000002e4',current_date-2,'12:00',4,'telefone','concluida','rodizio_carnes');
insert into sac_tickets(protocol,organization_id,unit_id,customer_id,category,subject,status) values
 ('SAC-19A',:'orga','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000002e4','elogio','Ótimo atendimento','aberto'),
 ('SAC-19B',:'orga','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000002e4','reclamacao','Demora em Anápolis','aberto');

create or replace function pg_temp.fails(_sql text, _like text) returns boolean language plpgsql as $$
begin execute _sql; return false; exception when others then return sqlerrm like _like; end $$;
create or replace function pg_temp.ok(_cond boolean, _what text) returns void language plpgsql as $$
begin if _cond is not true then raise exception 'FALHOU: %', _what; end if; raise notice 'ok  %', _what; end $$;

-- 1) Gestor da loja A1 enxerga só a própria loja/unidade e já cai nela
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.ok(jsonb_array_length(public.my_scope()->'units') = 1 and (public.my_scope()->>'default_unit_id') = '00000000-0000-0000-0000-0000000000a1', 'gestor A1: 1 unidade e já pré-selecionada');
select pg_temp.ok(jsonb_array_length(public.my_scope()->'organizations') = 1, 'gestor: só a própria loja na lista');
select pg_temp.ok(pg_temp.fails($q$select public.platform_organizations()$q$, '%FORBIDDEN%'), 'gestor não lista lojas da plataforma');
select pg_temp.ok(pg_temp.fails($q$select public.platform_switch_organization('00000000-0000-0000-0000-00000000f0b1')$q$, '%FORBIDDEN%'), 'gestor não troca de loja');
select pg_temp.ok(pg_temp.fails($q$select public.platform_create_organization('Outra')$q$, '%FORBIDDEN%'), 'gestor não cria loja');
select pg_temp.ok((select count(*) from public.customers_directory(null,null,100,0)) = 2, 'gestor A1: diretório só com Ana e Duda');
select pg_temp.ok(not exists (select 1 from public.customers_directory(null,null,100,0) where id in ('00000000-0000-0000-0000-0000000002e2','00000000-0000-0000-0000-0000000002e3')), 'gestor A1 não vê cliente de A2 nem da loja B');
select pg_temp.ok(pg_temp.fails($q$select public.customer_profile('00000000-0000-0000-0000-0000000002e2')$q$, '%NOT_FOUND%'), 'ficha de cliente só de A2: NOT_FOUND');
select pg_temp.ok(pg_temp.fails($q$select public.customer_profile('00000000-0000-0000-0000-0000000002e3')$q$, '%NOT_FOUND%'), 'ficha de cliente da loja B: NOT_FOUND');
select pg_temp.ok(pg_temp.fails($q$select * from public.customers_directory(null,'00000000-0000-0000-0000-0000000000a2',10,0)$q$, '%FORBIDDEN%'), 'filtro por unidade que não é dele: FORBIDDEN');
-- cliente que passou por duas unidades: a ficha mostra só o que é da unidade dele
select pg_temp.ok((public.customer_profile('00000000-0000-0000-0000-0000000002e4')->'stats'->>'reservas')::int = 1, 'ficha de quem foi a A1 e A2: só 1 reserva (a de A1)');
select pg_temp.ok(jsonb_array_length(public.customer_profile('00000000-0000-0000-0000-0000000002e4')->'sac') = 1, 'ficha: só o SAC de A1');
select pg_temp.ok(jsonb_array_length(public.customer_profile('00000000-0000-0000-0000-0000000002e4')->'reservations') = 1, 'ficha: lista só reservas de A1');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.customer_profile('00000000-0000-0000-0000-0000000002e4')->'log') l where l->>'note' = 'R4B'), 'ficha: log não vaza reserva de A2');

-- importação (gestor, só na própria unidade)
select pg_temp.ok(pg_temp.fails($q$select public.customers_import('[{"nome":"X","telefone":"62991110009"}]'::jsonb,'00000000-0000-0000-0000-0000000000a2')$q$, '%FORBIDDEN%'), 'import em unidade de outro: FORBIDDEN');
select pg_temp.ok(pg_temp.fails($q$select public.customers_import('[{"nome":"X","telefone":"62991110009"}]'::jsonb,'00000000-0000-0000-0000-0000000000a3')$q$, '%FORBIDDEN%'), 'import em unidade da loja B: FORBIDDEN');
select pg_temp.ok(pg_temp.fails($q$select public.customers_import('[]'::jsonb,'00000000-0000-0000-0000-0000000000a1')$q$, '%EMPTY_IMPORT%'), 'import vazio recusado');
create temp table imp as select public.customers_import($j$[
  {"nome":"Eva Nova","telefone":"(62) 99111-0005","email":"eva@x.com","observacoes":"aniversário em maio","aceita_whatsapp":"sim"},
  {"nome":"Ana A1","telefone":"62991110001","email":"ana@x.com"},
  {"nome":"Sem Fone","telefone":"123"},
  {"nome":"Z","telefone":"62991110006"},
  {"nome":"Ana Repetida","telefone":"62991110001","email":"outra@x.com"}
]$j$::jsonb,'00000000-0000-0000-0000-0000000000a1') r;
grant select on imp to authenticated;
select pg_temp.ok((select (r->>'criados')::int from imp) = 1 and (select (r->>'atualizados')::int from imp) = 1 and (select (r->>'total_erros')::int from imp) = 2 and (select (r->>'ja_existiam')::int from imp) = 1, 'import: 1 criado, 1 completado, 1 igual, 2 erros');
select pg_temp.ok((select email from public.customers where phone_e164='5562991110001') = 'ana@x.com', 'import completa e-mail vazio sem sobrescrever');
select pg_temp.ok((select whatsapp_opt_in from public.customers where phone_e164='5562991110005') and (select source from public.customers where phone_e164='5562991110005') = 'importacao', 'import: origem e aceite de WhatsApp registrados');
select pg_temp.ok(exists (select 1 from public.customers_directory('eva',null,10,0)), 'cliente importado (sem reserva) aparece pro gestor da unidade');
select pg_temp.ok(exists (select 1 from public.customers_directory('99111-0005',null,10,0)), 'busca por telefone formatado');
select pg_temp.ok(exists (select 1 from public.customers_directory(null,'00000000-0000-0000-0000-0000000000a1',10,0) where full_name = 'Eva Nova' and unit_name = 'Unidade A1'), 'filtro por unidade traz o importado');

-- cadastro e edição
select pg_temp.ok(pg_temp.fails($q$select public.customer_save(null,'Fulano','62991110001',null,null,'00000000-0000-0000-0000-0000000000a1')$q$, '%PHONE_EXISTS%'), 'telefone repetido: PHONE_EXISTS');
select pg_temp.ok(pg_temp.fails($q$select public.customer_save(null,'Fulano','123',null,null,'00000000-0000-0000-0000-0000000000a1')$q$, '%INVALID_PHONE%'), 'telefone inválido recusado');
select pg_temp.ok(pg_temp.fails($q$select public.customer_save(null,'Fulano','62991110007','sem-arroba',null,'00000000-0000-0000-0000-0000000000a1')$q$, '%INVALID_EMAIL%'), 'e-mail inválido recusado');
select pg_temp.ok(pg_temp.fails($q$select public.customer_save(null,'Fulano','62991110007',null,null,'00000000-0000-0000-0000-0000000000a2')$q$, '%FORBIDDEN%'), 'cadastrar em unidade de outro: FORBIDDEN');
select pg_temp.ok(pg_temp.fails($q$select public.customer_save('00000000-0000-0000-0000-0000000002e2','Bia','62991110002',null,null,null)$q$, '%NOT_FOUND%'), 'editar cliente de outra unidade: NOT_FOUND');
select pg_temp.ok(public.customer_save(null,'Fulano Novo','62991110007','F@X.com','vip','00000000-0000-0000-0000-0000000000a1', true) is not null, 'gestor cadastra cliente na própria unidade');
select pg_temp.ok((select email from public.customers where phone_e164='5562991110007') = 'f@x.com', 'e-mail normalizado em minúsculas');
select public.customer_save('00000000-0000-0000-0000-0000000002e1','Ana Souza','62991110001','ana@x.com','cliente fiel','00000000-0000-0000-0000-0000000000a1', false);
select pg_temp.ok((select whatsapp_opt_out_at is not null from public.customers where id='00000000-0000-0000-0000-0000000002e1'), 'desmarcar aceite grava a data de saída');
select public.customers_export_log(2,'00000000-0000-0000-0000-0000000000a1');
reset role;
select pg_temp.ok(exists (select 1 from public.customer_consents k join public.customers c on c.id = k.customer_id where c.phone_e164='5562991110007' and k.granted), 'aceite de WhatsApp grava consentimento');

-- Funcionário: vê, cadastra, mas não importa nem exporta
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.ok(pg_temp.fails($q$select public.customers_import('[{"nome":"Xx","telefone":"62991110008"}]'::jsonb,'00000000-0000-0000-0000-0000000000a1')$q$, '%FORBIDDEN%'), 'funcionário não importa');
select pg_temp.ok(pg_temp.fails($q$select public.customers_export_log(1,null)$q$, '%FORBIDDEN%'), 'funcionário não exporta');
select pg_temp.ok(exists (select 1 from public.customers_directory('ana',null,10,0)), 'funcionário vê a base da unidade');
select pg_temp.ok(public.customer_save(null,'Gui Func','62991110010',null,null,'00000000-0000-0000-0000-0000000000a1') is not null, 'funcionário cadastra cliente');
reset role;

-- 2) Gestor da loja B não vê nada da loja A (e o contrário)
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c4';
select pg_temp.ok((select count(*) from public.customers_directory(null,null,100,0)) = 1, 'gestor B1 vê só o cliente da loja B');
select pg_temp.ok(pg_temp.fails($q$select public.customer_profile('00000000-0000-0000-0000-0000000002e1')$q$, '%NOT_FOUND%'), 'gestor B1 não abre ficha da loja A');
reset role;

-- 3) Super admin troca de loja; o escopo (anúncios, clientes, unidades) segue a loja escolhida
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.ok(jsonb_array_length(public.my_scope()->'organizations') = 2 and (public.my_scope()->>'is_super_admin')::boolean, 'super admin vê as duas lojas');
select pg_temp.ok((select count(*) from public.platform_organizations()) = 2, 'platform_organizations lista as lojas com contagem');
select pg_temp.ok((public.my_scope()->>'organization_id')::uuid = (select id from organizations order by created_at limit 1), 'sem escolha, cai na primeira loja');
select pg_temp.ok(jsonb_array_length(public.my_scope()->'units') = 2, 'super admin na loja A: 2 unidades');
select public.platform_switch_organization('00000000-0000-0000-0000-00000000f0b1');
select pg_temp.ok((public.my_scope()->>'organization_id') = '00000000-0000-0000-0000-00000000f0b1', 'troca para a loja B');
select pg_temp.ok(jsonb_array_length(public.my_scope()->'units') = 1 and (public.my_scope()->>'default_unit_id') = '00000000-0000-0000-0000-0000000000a3', 'loja B: 1 unidade');
select pg_temp.ok((select count(*) from public.customers_directory(null,null,100,0)) = 1, 'diretório acompanha a loja escolhida');
select pg_temp.ok((public.my_scope()->>'organization_id') = '00000000-0000-0000-0000-00000000f0b1' and (select count(*) from public.customers_directory(null,null,100,0)) = 1, 'escopo (my_scope e diretório) segue a loja escolhida');
select pg_temp.ok(pg_temp.fails($q$select public.platform_switch_organization(gen_random_uuid())$q$, '%NOT_FOUND%'), 'loja inexistente: NOT_FOUND');
select public.platform_switch_organization((select id from organizations order by created_at limit 1));
select pg_temp.ok((select count(*) from public.customers_directory(null,null,100,0)) >= 6, 'de volta na loja A: base completa');
select pg_temp.ok(public.platform_create_organization('Loja C Teste') is not null, 'super admin cria loja');
select pg_temp.ok(pg_temp.fails($q$select public.platform_create_organization('Loja C Teste')$q$, '%SLUG_EXISTS%'), 'slug repetido recusado');
select pg_temp.ok(pg_temp.fails($q$select public.platform_create_organization('x')$q$, '%INVALID_NAME%'), 'nome curto recusado');
reset role;

-- quem não é super admin não é afetado por um registro de loja ativa
insert into user_active_org(user_id, organization_id) values ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-00000000f0b1');
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.ok((public.my_scope()->>'organization_id')::uuid = (select organization_id from user_profiles where id = '00000000-0000-0000-0000-0000000000c2'), 'gestor ignora loja ativa (só super admin troca)');
reset role;

-- 4) Alertas por tipo e perfil
set local role authenticated; set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.ok(pg_temp.fails($q$select public.notification_prefs_set(true, array['nao_existe'])$q$, '%INVALID_KIND%'), 'tipo de alerta inválido recusado');
select public.notification_prefs_set(true, array['reserva_pendente','sac_novo']);
select pg_temp.ok((public.notification_prefs_get()->'muted_kinds') @> '["reserva_pendente","sac_novo"]'::jsonb, 'preferências gravadas');
select public.notification_prefs_set(false);
select pg_temp.ok((public.notification_prefs_get()->>'email_alerts')::boolean = false and jsonb_array_length(public.notification_prefs_get()->'muted_kinds') = 2, 'chamada antiga (só e-mail) não apaga os tipos silenciados');
select public.notification_prefs_set(true);
select public.profile_update('Funcionária Silva','(62) 99999-1234');
select pg_temp.ok((select full_name from user_profiles where id = auth.uid()) = 'Funcionária Silva' and (select phone from user_profiles where id = auth.uid()) = '5562999991234', 'perfil atualizado');
select pg_temp.ok(pg_temp.fails($q$select public.profile_update('Ok','123')$q$, '%INVALID_PHONE%'), 'telefone do perfil inválido recusado');
select pg_temp.ok(pg_temp.fails($q$select public.profile_update('A',null)$q$, '%INVALID_NAME%'), 'nome do perfil curto recusado');
reset role;
select pg_temp.ok(not exists (select 1 from public._notif_recipients(:'orga','reserva_pendente','00000000-0000-0000-0000-0000000000a1') where email = 'func-a1@x.com'), 'quem silenciou "reserva nova" não recebe e-mail desse tipo');
select pg_temp.ok(exists (select 1 from public._notif_recipients(:'orga','reserva_cancelada','00000000-0000-0000-0000-0000000000a1') where email = 'func-a1@x.com'), 'mas continua recebendo os outros tipos');
select pg_temp.ok(exists (select 1 from public._notif_recipients(:'orga','reserva_pendente','00000000-0000-0000-0000-0000000000a1') where email = 'gestor-a1@x.com'), 'outros usuários não são afetados');

-- 5) Log
select pg_temp.ok(exists (select 1 from audit_log where action = 'cliente.importado' and unit_id = '00000000-0000-0000-0000-0000000000a1' and actor_name = 'Gestor A1'), 'log: importação com quem fez');
select pg_temp.ok(exists (select 1 from audit_log where action = 'cliente.exportado'), 'log: exportação');
select pg_temp.ok(exists (select 1 from audit_log where action = 'plataforma.loja_trocada' and actor_name = 'Super'), 'log: troca de loja');
select pg_temp.ok(exists (select 1 from audit_log where action = 'plataforma.loja_criada'), 'log: loja criada');
select pg_temp.ok(exists (select 1 from audit_log where action = 'usuario.alertas_preferencias' and actor_name = 'Func A1'), 'log: preferências de alerta');
select pg_temp.ok(exists (select 1 from audit_log where action = 'usuario.editado' and entity_id = '00000000-0000-0000-0000-0000000000c3'), 'log: perfil editado');
select pg_temp.ok(exists (select 1 from audit_log where action = 'cliente.criado' and unit_id = '00000000-0000-0000-0000-0000000000a1' and actor_name = 'Func A1'), 'log: cliente criado já aponta a unidade de origem');
select pg_temp.ok(not exists (select 1 from audit_log where action like 'plataforma.%' and entity_type is null), 'log da plataforma com entidade');
rollback;
