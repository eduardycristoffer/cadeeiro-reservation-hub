import { describe, expect, it } from "vitest";
import { barHeights, dayLabel, hookUrl, parseEndpoints, parseHookEvents, parseWifiGuests, parseWifiOverview, pct, phoneLabel } from "@/lib/wifi";

describe("parseWifiOverview", () => {
  it("lê totais e séries", () => {
    const o = parseWifiOverview({ days: 7, totals: { visits: 10, guests: 8, new_guests: 5, returning_guests: 3, with_phone: 6, with_consent: 4, reserved: 2, reserved_after: 1 }, by_day: [{ day: "2026-11-12", visits: 4, guests: 3 }, { visits: 1 }], by_hour: [{ hour: 19, visits: 3 }] });
    expect(o?.totals.visits).toBe(10);
    expect(o?.by_day).toEqual([{ day: "2026-11-12", visits: 4, guests: 3 }]);
    expect(o?.by_hour).toEqual([{ hour: 19, visits: 3 }]);
  });
  it("vazio vira zeros e lixo vira null", () => {
    expect(parseWifiOverview({})?.totals.visits).toBe(0);
    expect(parseWifiOverview(null)).toBeNull();
    expect(parseWifiOverview([])).toBeNull();
  });
});

describe("helpers", () => {
  it("pct", () => { expect(pct(1, 3)).toBe("33%"); expect(pct(0, 0)).toBe("—"); expect(pct(5, 5)).toBe("100%"); });
  it("barHeights: maior = 100, zero = 0, pequeno aparece", () => {
    expect(barHeights([0, 1, 100])).toEqual([0, 4, 100]);
    expect(barHeights([0, 0])).toEqual([0, 0]);
    expect(barHeights([])).toEqual([]);
  });
  it("dayLabel", () => { expect(dayLabel("2026-11-05")).toBe("05/11"); expect(dayLabel("xx")).toBe("xx"); });
  it("phoneLabel", () => {
    expect(phoneLabel("5562999990001")).toBe("(62) 99999-0001");
    expect(phoneLabel("556232221111")).toBe("(62) 3222-1111");
    expect(phoneLabel(null)).toBe("");
  });
  it("hookUrl", () => { expect(hookUrl("https://painel.exemplo.com/", "whk_abc")).toBe("https://painel.exemplo.com/api/public/hooks/whk_abc"); });
});

describe("parsers de lista", () => {
  it("visitantes: ignora linha sem id/datas", () => {
    const g = parseWifiGuests([{ id: "1", name: "Ana", phone: "5562999990001", visits: 2, first_seen_at: "a", last_seen_at: "b", consent: true, reserved: false }, { id: "2" }, null]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ name: "Ana", consent: true, reserved: false, visits: 2 });
  });
  it("endereços", () => {
    const e = parseEndpoints([{ id: "1", name: "Wi-Fi", kind: "x", token_hint: "ab12", events_7d: 4 }, { name: "sem id" }]);
    expect(e).toEqual([expect.objectContaining({ id: "1", kind: "wifi", is_active: true, events_7d: 4, token_hint: "ab12" })]);
  });
  it("eventos: só status conhecido", () => {
    expect(parseHookEvents([{ id: "1", received_at: "t", status: "erro", error: "X", payload: { a: 1 } }, { id: "2", received_at: "t", status: "outro" }])).toHaveLength(1);
  });
});
