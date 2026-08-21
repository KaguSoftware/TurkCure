import { describe, expect, it } from "vitest";
import { pdfFilenameHeaders } from "./case-doc";

/**
 * Regression guard for the non-ASCII filename bug: a raw Turkish name in
 * `filename=` throws a ByteString conversion error and 500s the route (it
 * happened — see the comment above pdfFilenameHeaders). The ASCII fallback
 * must stay Latin-1-safe and the real name must ride in RFC 5987 filename*.
 */
describe("pdfFilenameHeaders", () => {
  it("keeps filename= pure ASCII and the real name in filename*", () => {
    const h = pdfFilenameHeaders("Ayşe Çelik");
    const cd = h["Content-Disposition"];
    // Everything in the header value must be Latin-1 encodable — this is the
    // exact condition whose violation threw in production.
    expect([...cd].every((ch) => ch.charCodeAt(0) <= 0xff)).toBe(true);
    expect(cd).toContain('filename="Ayse Celik.pdf"');
    expect(cd).toContain(`filename*=UTF-8''${encodeURIComponent("Ayşe Çelik.pdf")}`);
  });

  it("never emits an empty filename", () => {
    const cd = pdfFilenameHeaders("题名")["Content-Disposition"];
    expect(cd).toContain('filename="patient.pdf"');
  });

  it("strips characters that break the quoted-string", () => {
    const cd = pdfFilenameHeaders('A"B\\C:D')["Content-Disposition"];
    const quoted = /filename="([^"]*)"/.exec(cd)?.[1] ?? "";
    expect(quoted).toBe("A B C D.pdf");
  });
});
