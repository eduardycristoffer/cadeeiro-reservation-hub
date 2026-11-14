import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => ({ options: opts }),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => <a href={to} {...rest}>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/push.functions", () => ({ getPushConfig: vi.fn(async () => ({ publicKey: null })), sendTestPush: vi.fn() }));
const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) }, requireSupabase: () => ({ rpc: (...a: unknown[]) => rpc(...a) }), friendlyError: (e: { message?: string }) => e.message ?? "erro" }));

import { Route } from "@/routes/admin.app";

const AppTab = (Route as unknown as { options: { component: () => React.JSX.Element } }).options.component;

beforeEach(() => {
  rpc.mockReset();
  Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36", configurable: true });
});

describe("aba App do painel", () => {
  it("mostra instalar, alertas, aparelhos e compartilhar, sem a palavra PWA", async () => {
    rpc.mockResolvedValue({ data: [{ id: "1", device_label: "Android · Chrome", created_at: "2026-11-13T10:00:00Z", last_seen_at: new Date().toISOString(), last_success_at: null, failures: 0, disabled: false, endpoint_tail: "abcdef123456" }], error: null });
    const { container } = render(<AppTab />);
    expect(await screen.findByRole("heading", { name: "App" })).toBeTruthy();
    expect(screen.getByText("Alertas no popup")).toBeTruthy();
    expect(screen.getByText("Passar o app para a equipe")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Android · Chrome")).toBeTruthy());
    expect(container.textContent?.toLowerCase()).not.toContain("pwa");
    expect(screen.getByTestId("app-link").textContent).toMatch(/\/app$/);
  });
  it("esconde a lista de aparelhos quando a migração ainda não foi aplicada", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.push_devices" } });
    render(<AppTab />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Seus aparelhos com alertas")).toBeNull());
  });
});
