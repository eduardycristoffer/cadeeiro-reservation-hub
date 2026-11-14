import { Text } from "@react-email/components";
import { AuthAction, AuthLayout, authNote, authText } from "./auth-layout";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <AuthLayout title="Confirme seu e-mail" preview="Falta só confirmar seu e-mail.">
    <Text style={authText}>
      Falta pouco! Confirme que <b>{recipient}</b> é seu para liberar o acesso.
    </Text>
    <AuthAction confirmationUrl={confirmationUrl}>Confirmar e-mail</AuthAction>
    <Text style={authNote}>Se você não criou esta conta, ignore este e-mail.</Text>
  </AuthLayout>
);
export default SignupEmail;
