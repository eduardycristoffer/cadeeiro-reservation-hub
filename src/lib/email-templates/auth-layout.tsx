import type { ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const colors = {
  red: "#d9201f",
  white: "#ffffff",
  background: "#f5f5f7",
  text: "#1d1d1f",
  muted: "#6e6e73",
  footer: "#86868b",
};
const fontFamily = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const authText = {
  margin: "0 0 12px",
  fontSize: "16px",
  lineHeight: "1.55",
  color: colors.text,
};
export const authNote = {
  margin: "18px 0 0",
  fontSize: "14px",
  lineHeight: "1.55",
  color: colors.muted,
};

export function AuthLayout({
  title,
  preview,
  children,
}: {
  title: string;
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{title}</title>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: colors.white,
          fontFamily,
          color: colors.text,
        }}
      >
        <Section style={{ backgroundColor: colors.background, padding: "28px 12px" }}>
          <Container
            style={{
              maxWidth: "560px",
              backgroundColor: colors.white,
              borderRadius: "24px",
              overflow: "hidden",
            }}
          >
            <Section
              style={{ height: "6px", backgroundColor: colors.red, fontSize: 0, lineHeight: "0" }}
            >
              {"\u00a0"}
            </Section>
            <Section style={{ padding: "26px 28px 6px", textAlign: "center" }}>
              <Img
                src="https://candeeiro.tryade.com.br/email-logo.png"
                width="200"
                alt="Rede Candeeiro"
                style={{
                  display: "block",
                  width: "200px",
                  maxWidth: "70%",
                  height: "auto",
                  border: 0,
                  margin: "0 auto",
                }}
              />
            </Section>
            <Section style={{ padding: "14px 32px 34px" }}>
              <Heading
                as="h1"
                style={{
                  margin: "0 0 14px",
                  fontSize: "24px",
                  lineHeight: "1.25",
                  fontWeight: 700,
                  color: colors.text,
                }}
              >
                {title}
              </Heading>
              {children}
            </Section>
          </Container>
          <Text
            style={{
              maxWidth: "560px",
              margin: "18px auto 0",
              fontSize: "12px",
              lineHeight: "1.6",
              color: colors.footer,
              textAlign: "center",
            }}
          >
            Você recebe este e-mail por fazer parte da equipe da Rede Candeeiro.
            <br />
            Painel de gestão ·{" "}
            <Link href="https://candeeiro.tryade.com.br/admin" style={{ color: colors.footer }}>
              candeeiro.tryade.com.br/admin
            </Link>
          </Text>
        </Section>
      </Body>
    </Html>
  );
}

export function AuthAction({
  confirmationUrl,
  children,
}: {
  confirmationUrl: string;
  children: ReactNode;
}) {
  return (
    <>
      <Section style={{ margin: "24px 0 4px" }}>
        <Button
          href={confirmationUrl}
          style={{
            backgroundColor: colors.red,
            color: colors.white,
            borderRadius: "14px",
            padding: "16px 28px",
            fontFamily,
            fontSize: "16px",
            fontWeight: 700,
            lineHeight: "1",
            textDecoration: "none",
          }}
        >
          {children}
        </Button>
      </Section>
    </>
  );
}

export function AuthCode({ token }: { token: string }) {
  return (
    <Text style={{ margin: "18px 0 8px", textAlign: "center" }}>
      <span
        style={{
          display: "inline-block",
          backgroundColor: colors.background,
          borderRadius: "14px",
          padding: "16px 26px",
          fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
          fontSize: "32px",
          fontWeight: 700,
          letterSpacing: ".35em",
          color: colors.text,
        }}
      >
        {token}
      </span>
    </Text>
  );
}
