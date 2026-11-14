import { useCallback, useEffect, useRef, useState } from "react";

/** Cache em memória (vale até fechar/recarregar o app): voltar para uma tela mostra o último resultado na hora e atualiza por trás. */
const cache = new Map<string, { at: number; data: unknown }>();
export const clearSwr = () => cache.clear();

/**
 * Carrega `fetcher` e guarda por `key`. Com `key` já visto devolve o dado antigo de imediato (`stale = true`) e atualiza;
 * ao trocar a `key` dentro do mesmo `group` (ex.: filtro da mesma aba) mantém o dado anterior na tela até o novo chegar; ao trocar de `group` (outra aba, outro formato de dado) limpa.
 */
export function useSwr<T>(key: string, fetcher: () => Promise<T>, extra: unknown[] = [], group = ""): { data: T | null; error: unknown; stale: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(() => (cache.get(key)?.data as T | undefined) ?? null);
  const [error, setError] = useState<unknown>(null);
  const [stale, setStale] = useState(() => cache.has(key));
  const [tick, setTick] = useState(0);
  const groupRef = useRef(group);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const hit = cache.get(key);
    if (hit) { setData(hit.data as T); setStale(true); }
    else if (groupRef.current !== group) setData(null);
    groupRef.current = group;
    setError(null);
    fetchRef.current().then((d) => {
      if (!alive) return;
      cache.set(key, { at: Date.now(), data: d });
      setData(d); setStale(false);
    }).catch((e) => { if (alive) { setError(e); setStale(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, ...extra]);

  return { data, error, stale, reload };
}
