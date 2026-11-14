// Gera docs/emails/*.html (com variáveis) e docs/emails/preview/*.html (com dados de exemplo).
import { mkdirSync, writeFileSync } from "node:fs";
import { TEMPLATES, render, fill } from "../src/emails/templates";

mkdirSync("docs/emails/preview", { recursive: true });
for (const t of TEMPLATES) {
  writeFileSync(`docs/emails/${t.id}.html`, render(t));
  writeFileSync(`docs/emails/preview/${t.id}.html`, fill(render(t, "../../../public/email-logo.png")));
}
writeFileSync("docs/emails/index.json", JSON.stringify(TEMPLATES.map(({ id, group, name, when, subject }) => ({ id, group, name, when, subject })), null, 2));
console.log(`${TEMPLATES.length} e-mails gerados`);
