import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  CIDADES,
  OFERTA,
  LGPD_TEXT,
  WHATSAPP_OPEN_EVENT,
  cidadeValida,
  whatsappDestino,
  type Cidade,
} from "@/lib/oferta";
import { SERVICE_LABEL } from "@/lib/reservations";
import { isValidFullName } from "@/lib/reserva";
import { maskBrPhone, isValidBrPhone } from "@/lib/format";
import { friendlyError, supabase } from "@/lib/supabase";
import { track } from "@/lib/pixel";
import { sanitizeCampaign } from "@/lib/reserva";

export function WhatsAppLead() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState<Cidade | undefined>();
  const [privacy, setPrivacy] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<string | undefined>();
  // botões das páginas de campanha abrem este mesmo formulário (com a cidade e a campanha da página)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = ((e as CustomEvent).detail ?? {}) as { city?: unknown; campaign?: unknown };
      setCity(cidadeValida(d.city));
      setCampaign(sanitizeCampaign(d.campaign));
      setOpen(true);
      setDone(false);
      setError(null);
    };
    window.addEventListener(WHATSAPP_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WHATSAPP_OPEN_EVENT, onOpen);
  }, []);
  if (path.startsWith("/admin") || path.startsWith("/api") || path === "/app") return null;
  function show() {
    const url = new URL(window.location.href);
    setCity(
      cidadeValida(url.searchParams.get("cidade")) ??
        (path === "/goiania/pizza" ? "goiania" : undefined),
    );
    setOpen(true);
    setDone(false);
    setError(null);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!city || !isValidFullName(name) || !isValidBrPhone(phone) || !privacy) return;
    if (!supabase) {
      setError("Atendimento indisponível no momento. Tente novamente em instantes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = new URL(window.location.href);
      const { data, error } = await supabase.rpc("capture_whatsapp_lead", {
        _full_name: name.trim(),
        _phone: phone,
        _city: city,
        _page_path: url.pathname,
        _privacy_accepted: privacy,
        _website: website,
        _utm_source: url.searchParams.get("utm_source"),
        _utm_medium: url.searchParams.get("utm_medium"),
        _utm_campaign: url.searchParams.get("utm_campaign") ?? url.searchParams.get("campanha") ?? campaign ?? null,
        _utm_content: url.searchParams.get("utm_content"),
        _fbclid: url.searchParams.get("fbclid"),
      });
      if (error) throw error;
      const result = data as { phone_e164?: string | null } | null;
      const destination = whatsappDestino(result?.phone_e164, name, city);
      track("Lead", { content_name: "whatsapp", content_category: city });
      track("Contact", { content_name: "whatsapp" });
      setDone(true);
      if (destination) window.location.assign(destination);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!path.startsWith("/c/") && <Button
        variant="brand"
        size="icon"
        className={`whatsapp-float fixed right-4 z-30 h-14 w-14 shadow-lift ${path.startsWith("/reservar") || path === "/goiania/pizza" ? "whatsapp-reserva" : "whatsapp-public"}`}
        aria-label="Falar no WhatsApp"
        onClick={show}
      >
        <MessageCircle className="size-6" />
      </Button>}
      <Sheet open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-3xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Fale com o Candeeiro</SheetTitle>
            <SheetDescription>
              {done ? "Contato recebido" : "Como podemos chamar você?"}
            </SheetDescription>
          </SheetHeader>
          {done ? (
            <div role="status" className="py-8">
              <CheckCircle2 className="mb-4 size-8 text-status-confirmed" />
              <p className="text-lg font-semibold">
                Recebemos seu contato, nossa equipe chama você em instantes
              </p>
              <Button className="mt-6 h-12 w-full" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <label className="block text-sm font-medium">
                Nome e sobrenome
                <Input
                  required
                  value={name}
                  maxLength={120}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-12"
                />
              </label>
              <label className="block text-sm font-medium">
                WhatsApp
                <Input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(maskBrPhone(e.target.value))}
                  className="mt-1 h-12"
                  placeholder="(62) 90000-0000"
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Cidade</legend>
                <div className="grid grid-cols-2 gap-2">
                  {CIDADES.map((c) => (
                    <Button
                      type="button"
                      key={c}
                      variant={city === c ? "brand" : "outline"}
                      aria-pressed={city === c}
                      className="h-12"
                      onClick={() => setCity(c)}
                    >
                      {OFERTA[c].nome}
                    </Button>
                  ))}
                </div>
              </fieldset>
              {city && (
                <p className="text-xs text-muted-foreground">
                  {OFERTA[city].servicos.map((s) => SERVICE_LABEL[s]).join(" · ")}
                </p>
              )}
              <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <Checkbox
                  checked={privacy}
                  onCheckedChange={(v) => setPrivacy(v === true)}
                  className="mt-1 size-5"
                />
                <span>{LGPD_TEXT}</span>
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                variant="brand"
                className="h-14 w-full"
                disabled={
                  busy || !city || !privacy || !isValidFullName(name) || !isValidBrPhone(phone)
                }
              >
                {busy ? <Loader2 className="animate-spin" /> : "Chamar no WhatsApp"}
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
