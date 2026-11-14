import { Text } from "@react-email/components";
import { AuthAction, AuthLayout, authNote, authText } from "./auth-layout";

interface EmailChangeEmailProps {
  siteName: string;
  oldEmail: string;
  email: string;
  newEmail: string;
  confirmationUrl: string;
}

export const EmailChangeEmail = ({
  oldEmail,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <AuthLayout title="Confirme a troca de e-mail" preview="Confirme a troca do e-mail de acesso.">
    <Text style={authText}>
      Você pediu para trocar o e-mail de acesso de <b>{oldEmail || email}</b> para <b>{newEmail}</b>
      .
    </Text>
    <AuthAction confirmationUrl={confirmationUrl}>Confirmar troca</AuthAction>
    <Text style={authNote}>Não pediu essa troca? Ignore este e-mail e avise um gestor.</Text>
  </AuthLayout>
);
export default EmailChangeEmail;
