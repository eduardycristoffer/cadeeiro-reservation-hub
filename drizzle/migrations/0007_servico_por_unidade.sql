create or replace function public.reservations_service_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_services text[];
begin
  if new.service is null then return new; end if;
  select u.services into v_services from public.units u where u.id = new.unit_id;
  if coalesce(cardinality(v_services), 0) > 0 and not (new.service = any (v_services)) then
    raise exception 'SERVICE_NOT_OFFERED';
  end if;
  return new;
end $$;

drop trigger if exists reservations_service_guard on public.reservations;
create trigger reservations_service_guard
before insert or update of service, unit_id on public.reservations
for each row execute function public.reservations_service_guard();

drop function if exists public.public_list_units();
create function public.public_list_units()
returns table(id uuid, name text, slug text, address text, city text, description text, photo_url text,
              large_group_threshold integer, max_advance_days integer, services text[])
language sql stable security definer set search_path = public as $$
  select u.id, u.name, u.slug, u.address, u.city, u.description, u.photo_url, u.large_group_threshold, u.max_advance_days,
         u.services
  from public.units u
  where u.is_active and u.accepts_online_reservations
  order by u.sort_order, u.name
$$;

revoke all on function public.public_list_units() from public;
grant execute on function public.public_list_units() to anon, authenticated;