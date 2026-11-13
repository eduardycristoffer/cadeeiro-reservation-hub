-- Etapa 4A: additive; no unit data, SDR contracts, integration tables or cron changed.
-- CHECKs already include almoco_quilo (006); widen only public input validation.
do $$
declare f text; signature regprocedure;
begin
  foreach signature in array array['public.capture_reservation_lead(text,text,text,text,boolean,boolean,text)'::regprocedure, 'public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text,text,text,text,text)'::regprocedure] loop
    f := pg_get_functiondef(signature);
    f := replace(f, 'v_service not in (''rodizio_carnes'', ''rodizio_pizza'')', 'v_service not in (''rodizio_carnes'', ''rodizio_pizza'', ''almoco_quilo'')');
    execute f;
  end loop;
end $$;

create table public.city_whatsapp_settings (
  city text primary key check (city in ('goiania','anapolis')),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+55[0-9]{10,11}$'),
  updated_at timestamptz not null default now()
);
grant select on public.city_whatsapp_settings to authenticated;
grant all on public.city_whatsapp_settings to service_role;
alter table public.city_whatsapp_settings enable row level security;
create policy "Super admin reads city WhatsApp" on public.city_whatsapp_settings for select to authenticated using (public.has_role(auth.uid(),'super_admin'));

create table public.whatsapp_leads (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 unit_id uuid not null references public.units(id),
 full_name text not null,
 phone_e164 text not null,
 city text not null check (city in ('goiania','anapolis')),
 origin text not null default 'whatsapp_botao',
 page_path text not null,
 utm_source text, utm_medium text, utm_campaign text, utm_content text, fbclid text,
 privacy_accepted boolean not null default true,
 status text not null default 'novo' check (status in ('novo','chamado','convertido','perdido')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select on public.whatsapp_leads to authenticated;
grant all on public.whatsapp_leads to service_role;
alter table public.whatsapp_leads enable row level security;
create policy "Read scoped WhatsApp leads" on public.whatsapp_leads for select to authenticated using (public.can_access_unit(auth.uid(),unit_id));
create index whatsapp_leads_unit_created_idx on public.whatsapp_leads(unit_id,created_at desc);
create index whatsapp_leads_city_created_idx on public.whatsapp_leads(city,created_at desc);

create function public.public_city_whatsapp()
returns table(city text, phone_e164 text) language sql stable security definer set search_path=public as $$
 select c.city, s.phone_e164 from (values ('goiania'),('anapolis')) c(city) left join public.city_whatsapp_settings s using(city)
$$;
revoke all on function public.public_city_whatsapp() from public;
grant execute on function public.public_city_whatsapp() to anon,authenticated;

create function public.admin_save_city_whatsapp(_city text,_phone text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_phone text; v_before jsonb;
begin
 if not public.has_role(auth.uid(),'super_admin') then raise exception 'FORBIDDEN'; end if;
 if _city not in ('goiania','anapolis') or _city is null then raise exception 'INVALID_CITY'; end if;
 if nullif(btrim(_phone),'') is not null then
   v_phone := public.normalize_br_phone(_phone);
   if v_phone is null then raise exception 'INVALID_PHONE'; end if;
 end if;
 select to_jsonb(s) into v_before from public.city_whatsapp_settings s where city=_city;
 insert into public.city_whatsapp_settings(city,phone_e164) values (_city,v_phone)
 on conflict(city) do update set phone_e164=excluded.phone_e164,updated_at=now();
 perform public.write_audit('painel','config.alterada','whatsapp_cidade',null,null,v_before,jsonb_build_object('city',_city,'phone_e164',v_phone),null);
end $$;
revoke all on function public.admin_save_city_whatsapp(text,text) from public,anon;
grant execute on function public.admin_save_city_whatsapp(text,text) to authenticated;

create function public.capture_whatsapp_lead(_full_name text,_phone text,_city text,_page_path text,
 _privacy_accepted boolean default false,_website text default null,
 _utm_source text default null,_utm_medium text default null,_utm_campaign text default null,_utm_content text default null,_fbclid text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_phone text := public.normalize_br_phone(_phone);
 v_name text := btrim(regexp_replace(coalesce(_full_name,''),'\s+',' ','g'));
 v_ip text := coalesce(nullif(split_part(coalesce(current_setting('request.headers',true)::json->>'x-forwarded-for',''),',',1),''),'na');
 v_unit public.units; v_id uuid; v_number text;
begin
 if coalesce(_website,'')<>'' then raise exception 'SPAM_DETECTED'; end if;
 if not coalesce(_privacy_accepted,false) then raise exception 'PRIVACY_REQUIRED'; end if;
 if length(v_name)<3 or length(v_name)>120 or v_name !~ '\s' then raise exception 'INVALID_NAME'; end if;
 if v_phone is null then raise exception 'INVALID_PHONE'; end if;
 if _city is null or _city not in ('goiania','anapolis') then raise exception 'INVALID_CITY'; end if;
 if _page_path is null or _page_path !~ '^/' or length(_page_path)>500 then raise exception 'INVALID_PAGE'; end if;
 if not public.hit_rate_limit('waleadip:'||v_ip,30) or not public.hit_rate_limit('waleadphone:'||v_phone,8) then raise exception 'RATE_LIMITED'; end if;
 select * into v_unit from public.units where slug=_city and organization_id=public._default_org() and is_active order by id limit 1;
 if not found then raise exception 'UNIT_UNAVAILABLE'; end if;
 insert into public.whatsapp_leads(organization_id,unit_id,full_name,phone_e164,city,page_path,utm_source,utm_medium,utm_campaign,utm_content,fbclid)
 values(v_unit.organization_id,v_unit.id,v_name,v_phone,_city,_page_path,left(_utm_source,200),left(_utm_medium,200),left(_utm_campaign,200),left(_utm_content,200),left(_fbclid,500)) returning id into v_id;
 perform public.write_audit('landing_page','lead.capturado','whatsapp_lead',v_id,v_unit.id,null,jsonb_build_object('city',_city,'origin','whatsapp_botao'),null);
 select phone_e164 into v_number from public.city_whatsapp_settings where city=_city;
 return jsonb_build_object('id',v_id,'phone_e164',v_number);
end $$;
revoke all on function public.capture_whatsapp_lead(text,text,text,text,boolean,text,text,text,text,text,text) from public;
grant execute on function public.capture_whatsapp_lead(text,text,text,text,boolean,text,text,text,text,text,text) to anon,authenticated;

create function public.set_whatsapp_lead_status(_id uuid,_status text)
returns void language plpgsql security definer set search_path=public as $$
declare l public.whatsapp_leads;
begin
 select * into l from public.whatsapp_leads where id=_id for update;
 if not found or not public.can_access_unit(auth.uid(),l.unit_id) then raise exception 'FORBIDDEN'; end if;
 if _status is null or _status not in ('novo','chamado','convertido','perdido') then raise exception 'INVALID_STATUS'; end if;
 update public.whatsapp_leads set status=_status,updated_at=now() where id=_id;
 perform public.write_audit('painel','lead.status_alterado','whatsapp_lead',_id,l.unit_id,jsonb_build_object('status',l.status),jsonb_build_object('status',_status),null);
end $$;
revoke all on function public.set_whatsapp_lead_status(uuid,text) from public,anon;
grant execute on function public.set_whatsapp_lead_status(uuid,text) to authenticated;

create function public.log_whatsapp_leads_export(_city text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
 perform public.write_audit('painel','lead.exportado','whatsapp_lead',null,null,null,null,_city);
end $$;
revoke all on function public.log_whatsapp_leads_export(text) from public,anon;
grant execute on function public.log_whatsapp_leads_export(text) to authenticated;

-- Extend the existing funnel with scoped aggregates, without replacing its existing calculations.
do $$
declare f text;
begin
 f := pg_get_functiondef('public.report_funnel(date,date,uuid,text,text)'::regprocedure);
 f := replace(f,'  return v;', $append$
  v := v || jsonb_build_object('whatsapp_button', (
    select jsonb_build_object('total',count(*),'converted',count(*) filter(where w.status='convertido'))
    from public.whatsapp_leads w
    where (w.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
    and public.can_access_unit(auth.uid(),w.unit_id) and (_unit is null or w.unit_id=_unit)
    and _service is null and (_origin is null or _origin='whatsapp_botao')
  ));
  return v;$append$);
 execute f;
end $$;
