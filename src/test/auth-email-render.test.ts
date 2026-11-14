// @vitest-environment node
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { SignupEmail } from "../lib/email-templates/signup";
import { InviteEmail } from "../lib/email-templates/invite";
import { RecoveryEmail } from "../lib/email-templates/recovery";
import { MagicLinkEmail } from "../lib/email-templates/magic-link";
import { EmailChangeEmail } from "../lib/email-templates/email-change";
import { ReauthenticationEmail } from "../lib/email-templates/reauthentication";

const props = {
  siteName: "Rede Candeeiro",
  siteUrl: "https://candeeiro.tryade.com.br",
  confirmationUrl: "https://candeeiro.tryade.com.br/primeiro-acesso?token=example&next=admin",
  recipient: "recipient@example.test",
  oldEmail: "old@example.test",
  email: "recipient@example.test",
  newEmail: "new@example.test",
};

describe("authentication email variables", () => {
  for (const [name, element] of Object.entries({
    signup: createElement(SignupEmail, props),
    invite: createElement(InviteEmail, props),
    recovery: createElement(RecoveryEmail, props),
    magiclink: createElement(MagicLinkEmail, props),
    email_change: createElement(EmailChangeEmail, props),
  })) {
    it(`${name} preserves the confirmation URL`, async () => {
      const text = await render(element, { plainText: true });
      expect(text).toContain(props.confirmationUrl);
    });
  }

  it("passes the recipient through signup and recovery", async () => {
    for (const component of [SignupEmail, RecoveryEmail]) {
      const text = await render(createElement(component, props), { plainText: true });
      expect(text).toContain(props.recipient);
    }
  });

  it("uses the original email when the recipient is the new email", async () => {
    const text = await render(
      createElement(EmailChangeEmail, { ...props, email: props.newEmail }),
      { plainText: true },
    );
    expect(text.indexOf(props.oldEmail)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(props.newEmail)).toBeGreaterThan(text.indexOf(props.oldEmail));
  });

  it("preserves the authentication code including leading zeroes", async () => {
    const text = await render(createElement(ReauthenticationEmail, { token: "012345" }), {
      plainText: true,
    });
    expect(text).toContain("012345");
  });
});
