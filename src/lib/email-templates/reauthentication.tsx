import { Text } from "@react-email/components";
import { AuthCode, AuthLayout, authNote, authText } from "./auth-layout";

interface ReauthenticationEmailProps {
  token: string;
}
export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <AuthLayout
    title="Seu código de confirmação"
    preview="Use este código para continuar. Ele vale por poucos minutos."
  >
    <Text style={authText}>Digite este código no painel para continuar:</Text>
    <AuthCode token={token} />
    <Text style={authNote}>
      Nunca compartilhe este código. A equipe da Rede Candeeiro não pede esse número por telefone
      nem por mensagem.
    </Text>
  </AuthLayout>
);
export default ReauthenticationEmail;
