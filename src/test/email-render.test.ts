// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@react-email/render";

describe("email HTML parsing", () => {
  it("decodes HTML entities when rendering plain text", async () => {
    const element = createElement("p", null, "Reserva & almoço <confirmado>");
    const html = await render(element);
    expect(html).toContain("&amp;");
    const text = await render(element, { plainText: true });
    expect(text).toContain("Reserva & almoço <confirmado>");
  });
});
