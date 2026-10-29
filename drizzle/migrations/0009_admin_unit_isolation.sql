-- Close unit bypasses without changing can_access_unit / can_manage_unit.
alter policy "gestor lê contatos CRM" on public.crm_contacts
using (public.has_role(auth.uid(), 'super_admin') or exists (
  select 1 from public.crm_conversations c where c.contact_id = crm_contacts.id
    and c.unit_id is not null and public.can_manage_unit(auth.uid(), c.unit_id)
));

alter policy "staff lê SAC" on public.sac_tickets
using (public.has_role(auth.uid(), 'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)));
alter policy "staff atualiza SAC" on public.sac_tickets
using (public.has_role(auth.uid(), 'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)))
with check (public.has_role(auth.uid(), 'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)));
alter policy "staff lê eventos SAC" on public.sac_ticket_events
using (exists (select 1 from public.sac_tickets s where s.id = sac_ticket_events.ticket_id
  and (public.has_role(auth.uid(), 'super_admin') or (s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id)))));
alter policy "staff cria eventos SAC" on public.sac_ticket_events
with check (author_id = auth.uid() and exists (select 1 from public.sac_tickets s where s.id = sac_ticket_events.ticket_id
  and (public.has_role(auth.uid(), 'super_admin') or (s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id)))));

-- Delivery-only customers must be readable in authorized order joins too.
alter policy "staff lê clientes de suas unidades" on public.customers
using (public.has_role(auth.uid(), 'super_admin')
  or exists (select 1 from public.reservations r where r.customer_id = customers.id and public.can_access_unit(auth.uid(), r.unit_id))
  or exists (select 1 from public.sac_tickets s where s.customer_id = customers.id and s.unit_id is not null and public.can_access_unit(auth.uid(), s.unit_id))
  or exists (select 1 from public.delivery_orders d where d.customer_id = customers.id and public.can_access_unit(auth.uid(), d.unit_id)));

-- Holidays are organization-wide pricing inputs, not owned by any unit.
-- Only super admins may modify them; retain shared staff read access.
alter policy "gestor gerencia feriados" on public.holidays
using (public.has_role(auth.uid(), 'super_admin')) with check (public.has_role(auth.uid(), 'super_admin'));
comment on table public.holidays is 'Organization-wide holiday calendar shared by unit pricing; modifications restricted to super_admin.';
