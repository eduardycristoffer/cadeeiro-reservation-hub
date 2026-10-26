-- Limpeza dos dados de teste de 26/10/2026 (NÃO é migration: rodar uma vez, à mão, depois de aprovada).
-- Alvo: 4 reservas criadas pela landing durante os testes, a linha de message_outbox e os 4 eventos de
-- saída do CRM ligados a elas. Escopo fechado por ID: nada além disso é tocado.
--
-- Por que cancelar em vez de apagar: o cancelamento mantém o histórico. O UPDATE dispara o trigger que
-- enfileira "reservation.status_changed" no CRM; por isso os eventos são apagados DEPOIS do cancelamento,
-- para nada de teste sair quando o CRM for ligado.
--
-- Antes de rodar, confira o SELECT de prévia. Se mais de 4 linhas aparecerem, pare.

begin;

create temp table _teste_ids on commit drop as
select unnest(array[
  '4f11ae6d-f52d-48d5-b56b-06c8f62b4ad7',  -- CAD-261027-E17CA  Teste da Silva
  '91248f91-9667-4e21-ab75-482b0f443807',  -- CAD-261027-55F52  Outra Pessoa Souza
  'f9ce8d7a-8441-498f-bc96-fec7bea9a4e1',  -- CAD-261027-9B7E0  Joao Pedro Teste
  '1432baff-b824-41ca-8dfa-f4a0ab1b82ff'   -- CAD-261028-CD3BE  Ana Beatriz OptIn
]::uuid[]) as id;

-- Prévia
select r.protocol, r.status, c.full_name, r.reservation_date
  from public.reservations r join public.customers c on c.id = r.customer_id
 where r.id in (select id from _teste_ids) order by r.created_at;

-- 1) Cancelar (só as que ainda estão ativas), com motivo no histórico
select set_config('app.status_note', 'Dado de teste (limpeza pré-produção)', true);
update public.reservations set status = 'cancelada'
 where id in (select id from _teste_ids) and status in ('pendente', 'confirmada');
select set_config('app.status_note', '', true);

-- 2) Zerar fila de saída do CRM e outbox ligados a elas (inclui os eventos criados pelo cancelamento)
delete from public.crm_events
 where direction = 'outbound'
   and (payload->>'reservation_id')::uuid in (select id from _teste_ids);
delete from public.message_outbox
 where reservation_id in (select id from _teste_ids);

-- Conferência: tudo abaixo deve ser 0, 0 e 4
select (select count(*) from public.crm_events where direction = 'outbound' and status = 'pendente') as eventos_pendentes,
       (select count(*) from public.message_outbox where status = 'pendente') as outbox_pendente,
       (select count(*) from public.reservations where id in (select id from _teste_ids) and status = 'cancelada') as reservas_canceladas;

commit;

-- OPCIONAL (irreversível): remover de vez as reservas de teste e os clientes de teste (dados pessoais fictícios).
-- Só descomente se o histórico delas não importa.
-- begin;
--   delete from public.reservations where id in ('4f11ae6d-f52d-48d5-b56b-06c8f62b4ad7','91248f91-9667-4e21-ab75-482b0f443807',
--                                                 'f9ce8d7a-8441-498f-bc96-fec7bea9a4e1','1432baff-b824-41ca-8dfa-f4a0ab1b82ff');
--   delete from public.customers c where c.full_name in ('Teste da Silva','Outra Pessoa Souza','Joao Pedro Teste','Ana Beatriz OptIn')
--     and not exists (select 1 from public.reservations r where r.customer_id = c.id);
-- commit;
