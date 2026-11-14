import { Text } from "@react-email/components";
import { AuthAction, AuthLayout, authNote, authText } from "./auth-layout";

interface RecoveryEmailProps {
  siteName: string;
  confirmationUrl: string;
  recipient?: string;
}

export const RecoveryEmail = ({ confirmationUrl, recipient }: RecoveryEmailProps) => (
  <AuthLayout title="Redefinir sua senha" preview="Crie uma senha nova para o painel.">
    <Text style={authText}>
      Recebemos um pedido para criar uma senha nova para{" "}
      <b>{recipient || "seu acesso ao painel"}</b>.
    </Text>
    <AuthAction confirmationUrl={confirmationUrl}>Criar senha nova</AuthAction>
    <Text style={authNote}>Não foi você? Ignore este e-mail: sua senha continua a mesma.</Text>
  </AuthLayout>
);
export default RecoveryEmail;
