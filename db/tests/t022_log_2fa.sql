-- Cenários da migração 022: histórico do 2FA.
\set ON_ERROR_STOP on
select id as org from organizations limit 1 \gset
begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000b1','func@x.com');
update user_profiles set organization_id=:'org', is_active=true where id='00000000-0000-0000-0000-0000000000b1';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
do $$ begin
  assert public.log_auth_event('2fa_ativado') = true, 'ativado ok';
  assert public.log_auth_event('2fa_desativado') = true, 'desativado ok';
  assert (select count(*) from audit_log where action = 'usuario.2fa_ativado' and entity_id = '00000000-0000-0000-0000-0000000000b1') = 1, 'ativado gravado';
  assert (select count(*) from audit_log where action = 'usuario.2fa_desativado') = 1, 'desativado gravado';
  begin perform public.log_auth_event('qualquer'); assert false, 'deveria barrar';
  exception when others then assert sqlerrm like '%INVALID_ACTION%', 'ação inválida: ' || sqlerrm; end;
end $$;
rollback;
select 'ok t022' as resultado;
