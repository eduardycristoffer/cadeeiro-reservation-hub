-- 022 · Histórico do 2FA (verificação em duas etapas, opcional por pessoa)
-- log_auth_event passa a aceitar '2fa_ativado' e '2fa_desativado' (gravados como usuario.2fa_ativado / usuario.2fa_desativado).
-- O resto da função é igual à 010.
create or replace function public.log_auth_event(_action text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_active boolean;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if _action not in ('login','logout','2fa_ativado','2fa_desativado') then raise exception 'INVALID_ACTION'; end if;
  select p.is_active into v_active from public.user_profiles p where p.id = auth.uid();
  if _action = 'login' and (v_active is distinct from true or not public.is_staff(auth.uid())) then
    perform public.write_audit('painel', 'login.bloqueado', 'usuario', auth.uid(), null, null, null,
      case when v_active is distinct from true then 'Usuário desativado' else 'Sem papel atribuído' end);
    return false;
  end if;
  if _action like '2fa\_%' then
    perform public.write_audit('painel', 'usuario.' || _action, 'usuario', auth.uid(), null, null, null, null);
    return true;
  end if;
  perform public.write_audit('painel', _action, 'usuario', auth.uid(), null, null, null, null);
  return true;
end $$;
