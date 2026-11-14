import * as React from "react";
import { createAuthEmailHandler } from "@lovable.dev/email-js";
import { createFileRoute } from "@tanstack/react-router";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";
import { ownLinkFromAuthUrl } from "@/lib/invite-link";

// Configuration
const SITE_NAME = "Rede Candeeiro";
const SENDER_DOMAIN = "notify.candeeiro.tryade.com.br";
const ROOT_DOMAIN = "candeeiro.tryade.com.br";
const FROM_DOMAIN = "notify.candeeiro.tryade.com.br";
const SITE_URL = `https://${ROOT_DOMAIN}`;
// O link que chega é do Supabase; a equipe só vê o endereço do painel.
const link = (url: string) => ownLinkFromAuthUrl(SITE_URL, url) ?? url;

// The SDK handler owns verification, dispatch, and retry semantics; this file
// owns only the email decisions: subjects, templates, and per-type props.
export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const handler = createAuthEmailHandler({
          apiKey: process.env["LOVABLE_API_KEY"]!,
          from: { name: SITE_NAME, address: `noreply@${FROM_DOMAIN}` },
          senderDomain: SENDER_DOMAIN,
          sendUrl: process.env["LOVABLE_SEND_URL"],
          emails: {
            signup: {
              subject: "Confirme seu e-mail — Rede Candeeiro",
              render: (data) =>
                React.createElement(SignupEmail, {
                  siteName: SITE_NAME,
                  siteUrl: SITE_URL,
                  recipient: data.email,
                  confirmationUrl: link(data.url),
                }),
            },
            invite: {
              subject: "Seu acesso ao painel Rede Candeeiro",
              render: (data) =>
                React.createElement(InviteEmail, {
                  siteName: SITE_NAME,
                  siteUrl: SITE_URL,
                  confirmationUrl: link(data.url),
                }),
            },
            magiclink: {
              subject: "Seu link de acesso — Rede Candeeiro",
              render: (data) =>
                React.createElement(MagicLinkEmail, {
                  siteName: SITE_NAME,
                  confirmationUrl: link(data.url),
                }),
            },
            recovery: {
              subject: "Redefinir sua senha — Rede Candeeiro",
              render: (data) =>
                React.createElement(RecoveryEmail, {
                  siteName: SITE_NAME,
                  recipient: data.email,
                  confirmationUrl: link(data.url),
                }),
            },
            email_change: {
              subject: "Confirme o novo e-mail — Rede Candeeiro",
              render: (data) =>
                React.createElement(EmailChangeEmail, {
                  siteName: SITE_NAME,
                  oldEmail: data.old_email ?? "",
                  email: data.email,
                  newEmail: data.new_email ?? "",
                  confirmationUrl: link(data.url),
                }),
            },
            reauthentication: {
              subject: "Seu código de confirmação — Rede Candeeiro",
              render: (data) =>
                React.createElement(ReauthenticationEmail, { token: data.token ?? "" }),
            },
          },
        });
        return handler(request);
      },
    },
  },
});
