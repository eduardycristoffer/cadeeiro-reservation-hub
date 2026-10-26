import preta from "@/assets/candeeiro_logo_preta.png.asset.json";
import branca from "@/assets/candeeiro_logo_branca.png.asset.json";

/** Logo Candeeiro: versão preta no tema claro, branca no tema escuro. */
export function BrandLogo({ className = "h-10" }: { className?: string }) {
  return (
    <span className="inline-flex items-center">
      <img src={preta.url} alt="Candeeiro Churrascaria e Pizzaria" className={`logo-on-light w-auto ${className}`} />
      <img src={branca.url} alt="" aria-hidden="true" className={`logo-on-dark w-auto ${className}`} />
    </span>
  );
}
