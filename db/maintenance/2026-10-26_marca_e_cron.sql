-- Executado direto no banco (não é migration): a ferramenta de migração do Lovable recusa estes comandos.
-- Já aplicado em produção em 26/10/2026; guardado aqui para recriar o ambiente.

-- Marca: organização renomeada para "Rede Candeeiro"
update public.organizations
   set name = 'Rede Candeeiro', slug = 'rede-candeeiro'
 where slug = 'rede-cadeeiro' and name = 'Rede Cadeeiro';

-- Retenção LGPD: todo dia às 03:30 UTC (00:30 em São Paulo)
select cron.schedule('cadeeiro_data_retention', '30 3 * * *', 'select public.run_data_retention()');
