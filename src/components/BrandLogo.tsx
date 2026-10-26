import corClaro from "@/assets/candeeiro_logo_colorida_2.png.asset.json";
import corEscuro from "@/assets/candeeiro_logo_colorida_1.png.asset.json";

/** Logo Candeeiro colorida: letras pretas no tema claro, letras brancas no tema escuro. */
export function BrandLogo({ className = "h-10" }: { className?: string }) {
  return (
    <span className="inline-flex items-center">
      <img src={corClaro.url} alt="Candeeiro Churrascaria e Pizzaria" className={`logo-on-light w-auto ${className}`} />
      <img src={corEscuro.url} alt="" aria-hidden="true" className={`logo-on-dark w-auto ${className}`} />
    </span>
  );
}
