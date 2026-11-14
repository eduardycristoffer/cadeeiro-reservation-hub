import { Text } from "@react-email/components";
import { AuthAction, AuthLayout, authNote, authText } from "./auth-layout";

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <AuthLayout
    title="Você foi convidado(a) para o painel"
    preview="Crie sua senha e comece a usar o painel."
  >
    <Text style={authText}>
      Olá! Você agora faz parte da equipe da <b>Rede Candeeiro</b>. Crie sua senha para entrar no
      painel de reservas e atendimento.
    </Text>
    <AuthAction confirmationUrl={confirmationUrl}>Criar minha senha</AuthAction>
    <Text style={authNote}>
      O link vale por tempo limitado e só funciona uma vez. Se você não esperava este convite, pode
      ignorar este e-mail.
    </Text>
  </AuthLayout>
);
export default InviteEmail;
