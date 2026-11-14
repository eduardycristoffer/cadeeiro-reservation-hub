import { Text } from "@react-email/components";
import { AuthAction, AuthLayout, authNote, authText } from "./auth-layout";

interface MagicLinkEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <AuthLayout title="Entrar no painel" preview="Toque para entrar no painel.">
    <Text style={authText}>Toque no botão para entrar. Você não precisa digitar a senha.</Text>
    <AuthAction confirmationUrl={confirmationUrl}>Entrar no painel</AuthAction>
    <Text style={authNote}>
      O link vale por poucos minutos e só funciona uma vez. Se não foi você, ignore.
    </Text>
  </AuthLayout>
);
export default MagicLinkEmail;
