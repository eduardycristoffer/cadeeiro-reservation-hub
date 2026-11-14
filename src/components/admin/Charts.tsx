import { useEffect, useRef, useState } from "react";

/** Gráficos leves (SVG puro, sem biblioteca) dos relatórios. Cores: série única = vermelho da marca; categorias = paleta validada (--series-1…6). */

export type Pt = { k: string | number; n: number };
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];
const BRAND = "var(--primary)";
const MUTED = "var(--muted-foreground)";
const GRID = "color-mix(in oklab, var(--muted-foreground) 22%, transparent)";

const n0 = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

/** Largura real do contêiner (o gráfico se desenha na medida certa, sem esticar o texto). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => setW(Math.round(e[0]?.contentRect.width ?? el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Escala "bonita" para o eixo Y: 0 … topo em passos redondos. */
function niceMax(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * 4 >= max) ?? mag * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

function Tip({ x, w, children }: { x: number; w: number; children: React.ReactNode }) {
  const right = x > w * 0.62;
  return (
    <div role="presentation" className="pointer-events-none absolute top-0 z-10 rounded-xl border bg-popover px-2.5 py-1.5 text-xs shadow-lift"
      style={{ left: right ? undefined : Math.max(0, x + 10), right: right ? Math.max(0, w - x + 10) : undefined }}>
      {children}
    </div>
  );
}

/** Evolução no tempo: área + linha, com guia e dica ao passar o dedo/mouse. */
export function TrendChart({ rows, label, fmtKey, unit = "reservas" }: { rows: Pt[] | undefined; label: string; fmtKey: (k: string) => string; unit?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const list = rows ?? [];
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  const H = 190, pl = 30, pr = 8, pt = 12, pb = 24;
  const iw = Math.max(40, w - pl - pr), ih = H - pt - pb;
  const max = Math.max(...list.map((r) => n0(r.n)), 1);
  const { top, ticks } = niceMax(max);
  const x = (i: number) => pl + (list.length === 1 ? iw / 2 : (i / (list.length - 1)) * iw);
  const y = (v: number) => pt + ih - (v / top) * ih;
  const line = list.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(n0(r.n)).toFixed(1)}`).join(" ");
  const area = `${line} L${x(list.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const peak = list.reduce((b, r, i) => (n0(r.n) > n0(list[b]!.n) ? i : b), 0);
  const total = list.reduce((a, r) => a + n0(r.n), 0);
  const labelIdx = Array.from(new Set([0, Math.floor((list.length - 1) / 2), list.length - 1]));
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(Math.min(list.length - 1, Math.max(0, Math.round(((px - pl) / iw) * (list.length - 1)))));
  }
  const h = hover !== null ? list[hover] : null;
  return (
    <figure className="m-0">
      <div ref={ref} className="relative w-full" style={{ height: H }}>
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label={`${label}: ${num(total)} ${unit} em ${list.length} dias, pico de ${num(n0(list[peak]!.n))} em ${fmtKey(String(list[peak]!.k))}`}
            onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={pl - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill={MUTED}>{t}</text>
              </g>
            ))}
            <path d={area} fill={BRAND} opacity={0.12} />
            <path d={line} fill="none" stroke={BRAND} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {labelIdx.map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === list.length - 1 ? "end" : "middle"} fontSize={10.5} fill={MUTED}>{fmtKey(String(list[i]!.k))}</text>
            ))}
            {list.length <= 45 && list.map((r, i) => <circle key={i} cx={x(i)} cy={y(n0(r.n))} r={list.length > 20 ? 0 : 2.5} fill={BRAND} stroke="var(--card)" strokeWidth={2} />)}
            <circle cx={x(peak)} cy={y(n0(list[peak]!.n))} r={4.5} fill={BRAND} stroke="var(--card)" strokeWidth={2} />
            {hover === null && <text x={Math.min(Math.max(x(peak), pl + 14), w - pr - 14)} y={Math.max(10, y(n0(list[peak]!.n)) - 9)} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">{n0(list[peak]!.n)}</text>}
            {h && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pt} y2={y(0)} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={x(hover)} cy={y(n0(h.n))} r={5} fill={BRAND} stroke="var(--card)" strokeWidth={2.5} />
              </g>
            )}
          </svg>
        )}
        {h && hover !== null && w > 0 && <Tip x={x(hover)} w={w}><p className="font-medium">{fmtKey(String(h.k))}</p><p className="text-muted-foreground"><span className="font-semibold text-foreground">{num(n0(h.n))}</span> {unit}</p></Tip>}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
      <table className="sr-only"><caption>{label}</caption><tbody>{list.map((r, i) => <tr key={i}><th>{fmtKey(String(r.k))}</th><td>{r.n}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Colunas (dia da semana, horário): o maior valor em destaque e escrito; dica ao tocar. */
export function ColumnChart({ rows, label, fmtKey, unit = "reservas", height = 170 }: { rows: Pt[] | undefined; label: string; fmtKey: (k: string | number) => string; unit?: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const list = rows ?? [];
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  const pl = 26, pr = 4, pt = 16, pb = 22;
  const iw = Math.max(40, w - pl - pr), ih = height - pt - pb;
  const max = Math.max(...list.map((r) => n0(r.n)), 1);
  const { top, ticks } = niceMax(max);
  const slot = iw / list.length;
  const bw = Math.min(34, Math.max(6, slot * 0.62));
  const best = list.reduce((b, r, i) => (n0(r.n) > n0(list[b]!.n) ? i : b), 0);
  const skip = Math.ceil(list.length / Math.max(3, Math.floor(iw / 34)));
  const h = hover !== null ? list[hover] : null;
  return (
    <figure className="m-0">
      <div ref={ref} className="relative w-full" style={{ height }}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={`${label}. Maior valor: ${fmtKey(list[best]!.k)} com ${num(n0(list[best]!.n))} ${unit}`} style={{ touchAction: "pan-y" }} onPointerLeave={() => setHover(null)}>
            {ticks.map((t) => {
              const yy = pt + ih - (t / top) * ih;
              return <g key={t}><line x1={pl} x2={w - pr} y1={yy} y2={yy} stroke={GRID} strokeWidth={1} /><text x={pl - 5} y={yy + 3.5} textAnchor="end" fontSize={10.5} fill={MUTED}>{t}</text></g>;
            })}
            {list.map((r, i) => {
              const v = n0(r.n), bh = Math.max(v > 0 ? 3 : 0, (v / top) * ih), bx = pl + i * slot + (slot - bw) / 2, by = pt + ih - bh;
              const on = i === best || i === hover;
              return (
                <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                  <rect x={pl + i * slot} y={pt} width={slot} height={ih + pb} fill="transparent" />
                  {bh > 0 && <path d={`M${bx},${by + bh} V${by + 4} Q${bx},${by} ${bx + 4},${by} H${bx + bw - 4} Q${bx + bw},${by} ${bx + bw},${by + 4} V${by + bh} Z`} fill={BRAND} opacity={on ? 1 : 0.5} />}
                  {i % skip === 0 && <text x={bx + bw / 2} y={height - 6} textAnchor="middle" fontSize={10.5} fill={MUTED}>{fmtKey(r.k)}</text>}
                  {i === best && hover === null && v > 0 && <text x={bx + bw / 2} y={by - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">{v}</text>}
                </g>
              );
            })}
          </svg>
        )}
        {h && hover !== null && w > 0 && <Tip x={pl + hover * slot + slot / 2} w={w}><p className="font-medium">{fmtKey(h.k)}</p><p className="text-muted-foreground"><span className="font-semibold text-foreground">{num(n0(h.n))}</span> {unit}</p></Tip>}
      </div>
      <table className="sr-only"><caption>{label}</caption><tbody>{list.map((r, i) => <tr key={i}><th>{fmtKey(r.k)}</th><td>{r.n}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Rosca com total no centro e legenda com valor e % (a legenda é a leitura "em tabela"). Até 6 categorias; o resto vira "Outros". */
export function DonutChart({ rows, label, unit = "reservas", colors }: { rows: Pt[] | undefined; label: string; unit?: string; colors?: Record<string, string> }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = (rows ?? []).filter((r) => n0(r.n) > 0).sort((a, b) => n0(b.n) - n0(a.n));
  if (all.length === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  const head = all.length > 6 ? all.slice(0, 5) : all;
  const rest = all.length > 6 ? all.slice(5).reduce((a, r) => a + n0(r.n), 0) : 0;
  const list: Pt[] = rest ? [...head, { k: "Outros", n: rest }] : head;
  const total = list.reduce((a, r) => a + n0(r.n), 0);
  const R = 62, r0 = 40, C = 2 * Math.PI * ((R + r0) / 2), sw = R - r0;
  let acc = 0;
  const colorOf = (k: string | number, i: number) => colors?.[String(k)] ?? SERIES[i % SERIES.length]!;
  return (
    <figure className="m-0 grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="relative mx-auto h-[150px] w-[150px]">
        <svg viewBox="-75 -75 150 150" width={150} height={150} role="img" aria-label={`${label}: ${list.map((r) => `${r.k} ${r.n}`).join(", ")}`} onPointerLeave={() => setHover(null)}>
          <g transform="rotate(-90)">
            {list.map((r, i) => {
              const frac = n0(r.n) / total, len = Math.max(0, frac * C - (list.length > 1 ? 2.5 : 0)), off = -acc * C;
              acc += frac;
              return <circle key={i} r={(R + r0) / 2} fill="none" stroke={colorOf(r.k, i)} strokeWidth={hover === i ? sw + 4 : sw} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={off} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} style={{ transition: "stroke-width .12s" }} />;
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold tabular-nums leading-none">{num(hover !== null ? n0(list[hover]!.n) : total)}</span>
          <span className="mt-1 max-w-[72px] truncate text-[11px] text-muted-foreground">{hover !== null ? String(list[hover]!.k) : unit}</span>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5 text-sm">
        {list.map((r, i) => (
          <li key={i} className="grid cursor-default grid-cols-[auto_minmax(0,1fr)_auto_2.75rem] items-center gap-2 rounded-lg px-1.5 py-0.5" style={hover === i ? { background: "var(--surface)" } : undefined} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(r.k, i) }} />
            <span className="truncate">{String(r.k)}</span>
            <span className="font-semibold tabular-nums">{num(n0(r.n))}</span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">{pct(n0(r.n), total)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Funil: etapas em barras decrescentes com a % de passagem entre elas. */
export function FunnelChart({ steps }: { steps: { label: string; n: number }[] }) {
  const max = Math.max(...steps.map((s) => s.n), 1);
  return (
    <ol className="space-y-1.5" aria-label="Funil">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.n : null;
        return (
          <li key={i}>
            {prev !== null && <p className="py-0.5 pl-1 text-[11px] text-muted-foreground">↓ {prev > 0 ? `${Math.round((s.n / prev) * 100)}% seguem` : "—"}</p>}
            <div className="relative h-10 overflow-hidden rounded-xl bg-surface">
              <div className="h-full rounded-xl" style={{ width: `${Math.max(s.n > 0 ? 6 : 0, (s.n / max) * 100)}%`, background: BRAND, opacity: 1 - i * 0.18 }} />
              <span className="absolute inset-y-0 left-3 flex items-center text-sm font-medium" style={{ color: s.n / max > 0.5 ? "var(--primary-foreground)" : "var(--foreground)" }}>{s.label}</span>
              <span className="absolute inset-y-0 right-3 flex items-center text-sm font-semibold tabular-nums">{num(s.n)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Barras horizontais ranqueadas com valor e % do total. */
export function RankBars({ rows, label = (k) => String(k), empty = "Sem dados no período.", showPct = true }: { rows: Pt[] | undefined; label?: (k: string | number) => string; empty?: string; showPct?: boolean }) {
  const list = rows ?? [];
  if (!list.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...list.map((r) => n0(r.n)), 1), total = list.reduce((a, r) => a + n0(r.n), 0);
  return (
    <ul className="space-y-2.5">
      {list.map((r, i) => (
        <li key={i} className="text-xs">
          <div className="mb-1 flex items-baseline justify-between gap-2"><span className="truncate">{label(r.k)}</span><span className="shrink-0 tabular-nums"><b className="font-semibold">{num(n0(r.n))}</b>{showPct && <span className="ml-1.5 text-muted-foreground">{pct(n0(r.n), total)}%</span>}</span></div>
          <div className="h-2.5 rounded-full bg-surface"><div className="h-2.5 rounded-full" style={{ width: `${Math.max(n0(r.n) > 0 ? 2 : 0, (n0(r.n) / max) * 100)}%`, background: BRAND, opacity: i === 0 ? 1 : 0.62 }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Barra empilhada única (ex.: aprovadas × recusadas × pendentes) com legenda e valores. */
export function SplitBar({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  return (
    <div>
      <div className="flex h-5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p, i) => <div key={i} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
        {parts.map((p, i) => <li key={i} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} /><span className="truncate text-muted-foreground">{p.label}</span><b className="ml-auto font-semibold tabular-nums">{num(p.n)}</b></li>)}
      </ul>
    </div>
  );
}
