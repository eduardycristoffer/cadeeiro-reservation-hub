import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CIDADES, OFERTA, type Cidade } from "@/lib/oferta";
import { maskBrPhone, isValidBrPhone } from "@/lib/format";
import { formatPhoneE164 } from "@/lib/reservations";
import { friendlyError, requireSupabase } from "@/lib/supabase";

export function CityWhatsAppSettings() {
  const [phones, setPhones] = useState<Record<Cidade, string>>({ goiania: "", anapolis: "" });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Cidade | null>(null);
  async function load() {
    const { data, error } = await requireSupabase().rpc("public_city_whatsapp");
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setError(null);
    const values: Record<Cidade, string> = { goiania: "", anapolis: "" };
    for (const row of (data ?? []) as { city: string; phone_e164: string | null }[]) {
      const city = row.city;
      if (city === "goiania" || city === "anapolis")
        values[city] = row.phone_e164 ? formatPhoneE164(row.phone_e164) : "";
    }
    setPhones(values);
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);
  async function save(city: Cidade) {
    setBusy(city);
    try {
      const { error } = await requireSupabase().rpc("admin_save_city_whatsapp", {
        _city: city,
        _phone: phones[city] || null,
      });
      if (error) throw error;
      toast.success("WhatsApp salvo");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="mt-5 border-t pt-5">
      <h2 className="text-lg font-semibold">WhatsApp por cidade</h2>
      {error ? (
        <div role="alert" className="mt-4">
          <p>{error}</p>
          <Button variant="outline" onClick={load}>
            Tentar de novo
          </Button>
        </div>
      ) : !loaded ? (
        <Loader2 className="m-6 animate-spin" />
      ) : (
        <div className="mt-4 divide-y rounded-3xl bg-card px-4 shadow-soft">
          {CIDADES.map((city) => (
            <div key={city} className="py-5">
              <label htmlFor={`wa-${city}`} className="text-sm font-semibold">
                {OFERTA[city].nome}
              </label>
              <div className="mt-2 flex gap-2">
                <Input
                  id={`wa-${city}`}
                  type="tel"
                  inputMode="tel"
                  value={phones[city]}
                  onChange={(e) =>
                    setPhones((p) => ({ ...p, [city]: maskBrPhone(e.target.value) }))
                  }
                  placeholder="DDD + WhatsApp"
                  className="h-12 min-w-0"
                />
                <Button
                  variant="brand"
                  className="h-12"
                  disabled={!!busy || (!!phones[city] && !isValidBrPhone(phones[city]))}
                  onClick={() => save(city)}
                >
                  {busy === city ? <Loader2 className="animate-spin" /> : "Salvar"}
                </Button>
              </div>
              {!phones[city] && (
                <p className="mt-2 text-xs text-muted-foreground">Sem número configurado</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
