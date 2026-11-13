import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { friendlyError, supabase } from "@/lib/supabase";
import { isValidBrPhone, maskBrPhone } from "@/lib/format";
import { CITIES, citySlug, sanitizeCampaign, type CitySlug } from "@/lib/reserva";
import { getConsent, loadPixels, setConsent, track, type Consent } from "@/lib/pixel";
import { buildWaUrl, parseWaLeadResult, pickUtm, type WaLeadResult } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

type Ready = { goiania: boolean; anapolis: boolean };

/**
 * Extras das páginas públicas: pixels da Meta (com consentimento), aviso de cookies e botão flutuante de WhatsApp.
 * Nunca monte isto dentro de /admin.
 */
function useSiteReady(): Ready | null {
  const [ready, setReady] = useState<Ready | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let off = false;
    // melhor esforço: se a função ainda não existe no banco, a página segue sem botão
    supabase.rpc("public_site_config").then(({ data, error }) => {
      if (off || error || !data) return;
      const r = (data as { whatsapp_ready?: Partial<Ready> }).whatsapp_ready;
      setReady({ goiania: Boolean(r?.goiania), anapolis: Boolean(r?.anapolis) });
    }, () => undefined);
    return () => { off = true; };
  }, []);
  return ready;
}

export function PublicExtras({ city, campaign, fab = true }: { city?: string | undefined; campaign?: string | undefined; fab?: boolean }) {
  const citySl = citySlug(city);
  const camp = sanitizeCampaign(campaign);
  const ready = useSiteReady();
  const [pixels, setPixels] = useState<string[]>([]);
  const [consent, setConsentState] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setConsentState(getConsent());
    const onConsent = () => setConsentState(getConsent());
    window.addEventListener("candeeiro:consent", onConsent);
    return () => window.removeEventListener("candeeiro:consent", onConsent);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let off = false;
    supabase.rpc("public_pixels", { _city: citySl ?? null, _campaign: camp ?? null }).then(({ data, error }) => {
      if (off || error || !Array.isArray(data)) return;
      setPixels((data as unknown[]).filter((x): x is string => typeof x === "string"));
    }, () => undefined);
    return () => { off = true; };
  }, [citySl, camp]);

  useEffect(() => {
    if (consent === "granted" && pixels.length) loadPixels(pixels);
  }, [consent, pixels]);

  const showBanner = mounted && pixels.length > 0 && consent === null;
  const anyReady = Boolean(ready && (ready.goiania || ready.anapolis));

  return (
    <>
      {fab && anyReady && ready && <WhatsAppFab ready={ready} defaultCity={citySl} campaign={camp} raised={showBanner} />}
      {showBanner && <ConsentBanner />}
    </>
  );
}

function ConsentBanner() {
  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-lg rounded-2xl bg-card/95 p-4 shadow-lift ring-1 ring-black/5 backdrop-blur">
      <p className="text-sm leading-snug text-muted-foreground">
        Usamos cookies de marketing para medir nossos anúncios. Nenhum dado pessoal é enviado. Você pode recusar.
      </p>
      <div className="mt-3 flex gap-2">
        <Button className="h-11 flex-1 rounded-xl" onClick={() => setConsent("granted")}>Aceitar</Button>
        <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setConsent("denied")}>Recusar</Button>
      </div>
    </div>
  );
}

type FabProps = {
  ready: Ready; defaultCity: CitySlug | undefined; campaign: string | undefined; raised?: boolean;
  source?: "fab" | "campanha" | "home"; showButton?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void;
};

function WhatsAppFab({ ready, defaultCity, campaign, raised = false, source = "fab", showButton = true, open: openProp, onOpenChange }: FabProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => { setOpenState(o); onOpenChange?.(o); };
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cityPick, setCityPick] = useState<CitySlug | null>(defaultCity ?? null);
  const [privacy, setPrivacy] = useState(false);
  const [website, setWebsite] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(WaLeadResult & { url: string | null }) | null>(null);

  const nameOk = name.trim().length >= 2;
  const phoneOk = isValidBrPhone(phone);
  const cities = CITIES.filter((c) => ready[c.slug]);

  async function submit() {
    setTouched(true);
    if (!supabase || !nameOk || !phoneOk || !cityPick || !privacy) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("capture_whatsapp_lead", {
      _full_name: name.trim(),
      _phone: phone,
      _city: cityPick,
      _campaign: campaign ?? null,
      _source: source,
      _utm: pickUtm(window.location.search),
      _page: window.location.pathname,
      _privacy_accepted: privacy,
      _website: website,
    });
    setBusy(false);
    if (err) { setError(friendlyError(err)); return; }
    const res = parseWaLeadResult(data);
    if (!res) { setError("Algo deu errado. Tente novamente."); return; }
    track("Lead", { content_name: "whatsapp", content_category: cityPick });
    track("Contact", { content_name: "whatsapp" });
    const url = buildWaUrl(res.whatsapp, res.message);
    setDone({ ...res, url });
    if (url) window.location.assign(url);
  }

  return (
    <>
      {showButton && <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Falar no WhatsApp"
        className={cn(
          "fixed right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-[#168a45] pl-4 pr-5 text-white shadow-lift transition active:scale-95",
          raised ? "bottom-40" : "bottom-5",
        )}
      >
        <MessageCircle className="size-6" aria-hidden="true" />
        <span className="text-sm font-semibold">WhatsApp</span>
      </button>}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setDone(null); setError(null); } }}>
        <DialogContent className="max-w-sm rounded-3xl p-6">
          {done ? (
            <div className="text-center">
              <DialogHeader>
                <DialogTitle className="text-xl">{done.url ? "Abrindo o WhatsApp…" : "Recebemos seu contato!"}</DialogTitle>
                <DialogDescription>
                  {done.url ? "Se não abrir sozinho, toque no botão abaixo." : "Nossa equipe vai falar com você pelo WhatsApp em breve."}
                </DialogDescription>
              </DialogHeader>
              {done.url && (
                <a href={done.url} className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-[#168a45] text-base font-semibold text-white">
                  Abrir WhatsApp
                </a>
              )}
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
              <DialogHeader>
                <DialogTitle className="text-xl">Fale com a gente</DialogTitle>
                <DialogDescription>Conte quem você é e escolha a cidade. Abrimos o WhatsApp certo para você.</DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="wa-name" className="mb-1.5 block text-sm font-semibold text-muted-foreground">Seu nome</label>
                  <Input id="wa-name" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} className="h-12 rounded-2xl border-0 bg-surface text-base" />
                  {touched && !nameOk && <p className="mt-1 text-sm text-destructive">Informe seu nome.</p>}
                </div>
                <div>
                  <label htmlFor="wa-phone" className="mb-1.5 block text-sm font-semibold text-muted-foreground">Seu WhatsApp</label>
                  <Input id="wa-phone" value={phone} inputMode="tel" autoComplete="tel-national" onChange={(e) => setPhone(maskBrPhone(e.target.value))} placeholder="(62) 90000-0000" className="h-12 rounded-2xl border-0 bg-surface text-base tabular-nums" />
                  {touched && !phoneOk && <p className="mt-1 text-sm text-destructive">Informe DDD + número.</p>}
                </div>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold text-muted-foreground">Qual cidade?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {cities.map((c) => (
                      <button key={c.slug} type="button" aria-pressed={cityPick === c.slug} onClick={() => setCityPick(c.slug)}
                        className={cn("h-12 rounded-2xl text-base font-semibold transition", cityPick === c.slug ? "tile-on" : "tile")}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {touched && !cityPick && <p className="mt-1 text-sm text-destructive">Escolha a cidade.</p>}
                </fieldset>
                {/* campo isca: pessoas não veem; robôs preenchem */}
                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
                </div>
                <label className="flex items-start gap-3 text-sm leading-snug text-muted-foreground">
                  <Checkbox checked={privacy} onCheckedChange={(v) => setPrivacy(v === true)} className="mt-0.5" />
                  <span>Concordo em ser contatado por WhatsApp e com o uso dos meus dados para atendimento (LGPD).</span>
                </label>
                {touched && !privacy && <p className="text-sm text-destructive">É preciso aceitar para continuar.</p>}
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              </div>
              <Button type="submit" disabled={busy} className="mt-5 h-12 w-full rounded-2xl bg-[#168a45] text-base font-semibold text-white hover:bg-[#12733a]">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continuar no WhatsApp"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Botão grande que abre o formulário de WhatsApp (nome + telefone + cidade) — usado nas páginas de campanha. */
export function WhatsAppCta({ city, campaign, label = "Falar no WhatsApp" }: { city?: string | undefined; campaign?: string | undefined; label?: string }) {
  const ready = useSiteReady();
  const [open, setOpen] = useState(false);
  const citySl = citySlug(city);
  const camp = sanitizeCampaign(campaign);
  if (!ready) return <div className="h-14 animate-pulse rounded-2xl bg-surface" aria-busy="true" />;
  if (!ready.goiania && !ready.anapolis) {
    return <p role="status" className="rounded-2xl bg-surface p-4 text-center text-sm text-muted-foreground">O WhatsApp desta campanha será liberado em breve.</p>;
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-14 w-full rounded-2xl bg-[#168a45] text-base font-semibold text-white hover:bg-[#12733a]">
        <MessageCircle className="size-5" aria-hidden="true" /> {label}
      </Button>
      <WhatsAppFab ready={ready} defaultCity={citySl} campaign={camp} source="campanha" showButton={false} open={open} onOpenChange={setOpen} />
    </>
  );
}
