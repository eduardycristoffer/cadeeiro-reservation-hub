-- 023 · Mensagem ao cliente sempre pela caixa (WhatsApp) da unidade da reserva
-- Bug: cancelar uma reserva de Anápolis mandava a mensagem pelo WhatsApp de Goiânia. Quando a reserva não tinha conversa
-- ligada, o n8n procurava o cliente em TODAS as caixas e usava a conversa mais recente (a de outra unidade).
-- Agora: (1) só vale como "conversa da reserva" uma conversa da mesma unidade; (2) o disparo manda `unit_inbox_id`
-- (número da caixa da unidade, de crm_inbox_units) e o n8n só escolhe conversa dessa caixa. Sem conversa na caixa
-- da unidade → falha "sem_conversa" (nada sai pela unidade errada).
create or replace function public.dispatch_reservation_confirmations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_secret text; r record; resp record; v_req bigint; v_payload jsonb; v_body jsonb; v_res record; n int := 0; v_want text;
  v_reason text; v_prev text; v_text text; v_inbox integer;
begin
  select value into v_url from public.app_private_config where key = 'n8n_confirmacao_url';
  select value into v_secret from public.app_private_config where key = 'n8n_confirmacao_segredo';
  if v_url is null or v_secret is null then return 0; end if;

  -- 1) colher respostas do n8n
  for r in select * from public.message_outbox
           where dedupe_key like 'whatsapp:reserva_%' and status = 'processando' and external_id like 'net:%' loop
    select * into resp from net._http_response where id = substring(r.external_id from 5)::bigint;
    if not found then
      if r.updated_at < now() - interval '3 minutes' then
        update public.message_outbox
           set status = case when attempts >= 5 then 'falhou'::queue_status else 'pendente'::queue_status end,
               error = 'sem resposta do n8n', external_id = null, scheduled_for = now() + (attempts * interval '1 minute')
         where id = r.id;
      end if;
      continue;
    end if;
    begin v_body := resp.content::jsonb; exception when others then v_body := null; end;
    if resp.status_code = 200 and v_body->>'ok' = 'true' and v_body->>'resultado' = 'enviado' then
      update public.message_outbox set status = 'enviado', sent_at = now(), external_id = v_body->>'mensagem_id', error = null where id = r.id;
    elsif resp.status_code = 200 and v_body->>'ok' = 'true' then
      update public.message_outbox set status = 'cancelado', external_id = null, error = 'ignorado: ' || coalesce(v_body->>'motivo', '?') where id = r.id;
    elsif resp.status_code = 200 and v_body->>'resultado' = 'erro' and v_body->>'motivo' in ('sem_conversa', 'data_invalida') then
      update public.message_outbox set status = 'falhou', external_id = null, error = v_body->>'motivo' where id = r.id;
    else
      update public.message_outbox
         set status = case when attempts >= 5 then 'falhou'::queue_status else 'pendente'::queue_status end,
             error = left(coalesce(v_body->>'erro', v_body->>'motivo', resp.error_msg, resp.content, 'erro'), 300),
             external_id = null, scheduled_for = now() + (attempts * interval '2 minutes')
       where id = r.id;
    end if;
  end loop;

  -- 2) disparar pendentes (confirmacao e cancelamento)
  for r in select * from public.message_outbox
           where dedupe_key like 'whatsapp:reserva_%' and status = 'pendente' and scheduled_for <= now() and attempts < 5
           order by created_at limit 20 for update skip locked loop
    v_want := case when r.dedupe_key like 'whatsapp:reserva_cancelada:%' then 'cancelada' else 'confirmada' end;
    select res.id, res.status::text as status, res.protocol, res.reservation_date, res.reservation_time, res.party_size, res.celebrant_name,
           u.name as unit_name, cu.phone_e164, cu.full_name,
           (select c.external_id from public.crm_conversations c where c.reservation_id = res.id and (c.unit_id is null or c.unit_id = res.unit_id) order by c.updated_at desc limit 1) as conv,
           res.unit_id
      into v_res
      from public.reservations res
      join public.units u on u.id = res.unit_id
      join public.customers cu on cu.id = res.customer_id
     where res.id = r.reservation_id;
    if not found or v_res.status <> v_want or v_res.reservation_date < (now() at time zone 'America/Sao_Paulo')::date
       or r.created_at < now() - interval '1 day' then
      update public.message_outbox set status = 'cancelado', error = 'expirado ou reserva nao esta mais no status esperado' where id = r.id;
      continue;
    end if;
    -- caixa (inbox) do CRM desta unidade: 'conta:caixa' → caixa
    v_inbox := null;
    select nullif(regexp_replace(split_part(m.inbox_external_id, ':', 2), '\D', '', 'g'), '')::integer into v_inbox
      from public.crm_inbox_units m where m.unit_id = v_res.unit_id limit 1;
    v_reason := null; v_prev := null;
    if v_want = 'cancelada' then
      select h.note, h.from_status::text into v_reason, v_prev from public.reservation_status_history h
       where h.reservation_id = v_res.id and h.to_status = 'cancelada' order by h.created_at desc limit 1;
    end if;
    -- modelo personalizado (se houver); qualquer falha aqui NUNCA impede o aviso ao cliente
    begin
      v_text := public._crm_transactional_text(case when v_want = 'cancelada' then 'cancelamento' else 'confirmacao' end, v_res.id, v_reason);
    exception when others then v_text := null; end;
    v_payload := jsonb_build_object('protocol', v_res.protocol, 'status', v_res.status, 'unit_name', v_res.unit_name,
      'date', v_res.reservation_date, 'time', v_res.reservation_time, 'party_size', v_res.party_size,
      'phone', v_res.phone_e164, 'customer_name', v_res.full_name, 'celebrant_name', v_res.celebrant_name,
      'conversation_external_id', v_res.conv, 'reason', v_reason, 'previous_status', v_prev, 'text', v_text,
      'unit_id', v_res.unit_id, 'unit_inbox_id', v_inbox);
    select net.http_post(url := v_url, body := v_payload,
             headers := jsonb_build_object('Content-Type', 'application/json', 'x-candeeiro-segredo', v_secret),
             timeout_milliseconds := 30000) into v_req;
    update public.message_outbox set status = 'processando', attempts = attempts + 1, external_id = 'net:' || v_req, error = null where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

