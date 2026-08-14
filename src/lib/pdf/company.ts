/**
 * Company details printed on every document.
 *
 * Deliberately its own module with zero imports: `common.tsx` reaches for
 * `node:fs`/`node:path` to resolve the embedded fonts, so anything that pulls
 * COMPANY from there drags the Node built-ins (and the whole PDF renderer) into
 * the client bundle. The editor's document seeder needs these strings on both
 * sides of the wire, so they live here instead.
 */
export const COMPANY = {
  name: "Turkcure Health Tourism",
  whatsapp: "+90 552 112 99 52",
  website: "Turkcure.com",
  location: "Skyland, Istanbul",
  address: "Huzur, Azerbaycan Cd. B Blok No:48, 34475 Sarıyer/İstanbul",
  url: "https://turkcure.com",
};
