# Testes de banco (Postgres local descartável)

Cenários SQL que provam as regras das migrações 013–017 (por cima da 012 do Lovable) (permissões, isolamento por unidade,
fila de envios, limites, opt-out). **Não rodam em produção** — usam um Postgres temporário com
`stubs.sql` simulando `auth`, `net` (pg_net) e os papéis do Supabase.

```bash
# 1) Postgres local qualquer (exemplo: socket em /tmp/pgtest, porta 5544)
# 2) Recria o banco e aplica stubs + todas as migrações
./db/tests/run.sh          # variáveis: PGHOST, PGPORT, PGUSER
# 3) Roda um cenário
psql -h /tmp/pgtest -p 5544 -U postgres -d cand -f db/tests/t015_crm.sql
```

Os cenários imprimem `ok`/valores esperados e levantam exceção quando uma regra quebra.
