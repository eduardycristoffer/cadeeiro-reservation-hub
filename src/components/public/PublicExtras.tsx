import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { citySlug, sanitizeCampaign } from "@/lib/reserva";
import { WHATSAPP_OPEN_EVENT } from "@/lib/oferta";
import { getConsent, loadPixels, setConsent, type Consent } from "@/lib/pixel";

/**
 * Extras das páginas públicas: pixels da Meta (com consentimento) e aviso de cookies.
 * O botão flutuante de WhatsApp é global (WhatsAppLead, montado na raiz). Nunca monte isto dentro de /admin.
 */
export function PublicExtras({ city, campaign }: { city?: string | undefined; campaign?: string | undefined }) {
  const citySl = citySlug(city);
  const camp = sanitizeCampaign(campaign);
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
    // melhor esforço: se a função ainda não existe no banco, a página segue sem pixel
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

  // o botão de WhatsApp sobe enquanto o aviso de cookies estiver na tela
  useEffect(() => {
    const el = document.documentElement;
    if (showBanner) el.setAttribute("data-consent-banner", "1"); else el.removeAttribute("data-consent-banner");
    return () => el.removeAttribute("data-consent-banner");
  }, [showBanner]);

  return showBanner ? <ConsentBanner /> : null;
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

/** Botão grande das páginas de campanha: abre o mesmo formulário do botão flutuante (nome, WhatsApp e cidade). */
export function WhatsAppCta({ city, campaign, label = "Falar no WhatsApp" }: { city?: string | undefined; campaign?: string | undefined; label?: string }) {
  return (
    <Button
      type="button"
      variant="brand"
      onClick={() => window.dispatchEvent(new CustomEvent(WHATSAPP_OPEN_EVENT, { detail: { city: citySlug(city) ?? null, campaign: sanitizeCampaign(campaign) ?? null } }))}
      className="h-14 w-full rounded-2xl text-base font-semibold"
    >
      <MessageCircle className="size-5" aria-hidden="true" /> {label}
    </Button>
  );
}
