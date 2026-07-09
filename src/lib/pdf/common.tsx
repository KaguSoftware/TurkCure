import { StyleSheet } from "@react-pdf/renderer";

export const BLUE = "#2563eb";
export const GREEN = "#10b981";
export const TEXT = "#1e293b";
export const MUTED = "#64748b";
export const BORDER = "#94a3b8";
export const HEAD_BG = "#e8edf5";

export const COMPANY = {
  name: "Turkcure Health Tourism",
  whatsapp: "+90 552 112 99 52",
  website: "Turkcure.com",
  location: "Skyland, Istanbul",
  address: "Huzur, Azerbaycan Cd. B Blok No:48, 34475 Sarıyer/İstanbul",
  url: "https://turkcure.com",
};

export const pdfStyles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 64, fontSize: 9, color: TEXT, fontFamily: "Helvetica" },
  brand: { fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1 },
  docTitle: { fontSize: 15, color: BLUE, textAlign: "right" },
  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 10 },
  sectionHead: {
    backgroundColor: HEAD_BG,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: BLUE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  rowLast: { flexDirection: "row" },
  cellLabel: {
    width: "32%",
    padding: 5,
    fontFamily: "Helvetica-Bold",
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  cellValue: { flex: 1, padding: 5 },
  bold: { fontFamily: "Helvetica-Bold" },
  bullet: { width: "50%", paddingVertical: 2, paddingRight: 8 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    textAlign: "center",
    color: MUTED,
    fontSize: 7.5,
  },
  instrHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: BLUE,
    marginTop: 8,
    marginBottom: 3,
  },
  instrLine: { marginBottom: 2.5, lineHeight: 1.4 },
});

export function mdLines(md: string): { text: string; heading: boolean; bullet: boolean }[] {
  return md
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("#"))
        return { text: line.replace(/^#+\s*/, ""), heading: true, bullet: false };
      if (line.startsWith("-") || line.startsWith("*"))
        return { text: line.replace(/^[-*]\s*/, ""), heading: false, bullet: true };
      return { text: line, heading: false, bullet: false };
    });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

export function nightsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  const nights = Math.round(ms / 86400000);
  return nights > 0 ? nights : null;
}
