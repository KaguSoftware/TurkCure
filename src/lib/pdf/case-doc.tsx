import React from "react";
import { Page, Text, View, Image } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MUTED,
  INK,
  TEXT,
  TABLE_LINE,
  SANS,
  SERIF,
  fmtDate,
  fmtGender,
  nightsBetween,
  PdfFooter,
  TableSection,
  TRow,
  Mark,
  CoverOrnament,
  usePdfTheme,
} from "@/lib/pdf/common";
import { PdfMarkdown } from "@/lib/pdf/markdown";

/**
 * The patient-facing case document ("WOF"), split into pieces so the
 * single-case route and the combined multi-case route render exactly the same
 * material. Patient-level blocks (patient info, company, confirmation) are
 * separate components from the per-case body precisely so the combined document
 * can state them once.
 */

/** Everything the document needs about one case, already derived. */
export interface CaseDocData {
  caseId: string;
  ref: string;
  op: string;
  doctor: string;
  hospital: string;
  hotel: string;
  /** Display form, e.g. "Euros" — already mapped from the currency code. */
  currency: string;
  arrival_date: string | null;
  departure_date: string | null;
  surgery_date: string | null;
  airport: string;
  airport_pickup: string;
  totalNights: number | null;
  hospitalNights: number | null;
  packageBullets: string[];
  total: number;
  deposit: number;
  /**
   * The "Deposit paid" line, preformatted. Equals money(deposit) when every
   * paid deposit is in the case currency; otherwise shows what was actually
   * handed over, e.g. "500 Euros (= 540 USD)". Computed once here so the PDF
   * and the editor seed (buildCaseDoc) can never drift apart.
   */
  depositDisplay: string;
  additionalCosts: { title: string; amount: number }[];
  instructions: { title: string; body_md: string; image_paths: string[] }[];
  coverLine1: string;
  coverLine2: string;
}

/** Patient-level material — stated once even in a multi-case document. */
export interface PatientDocData {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: string;
  passport_number: string;
  country: string | null;
  coordinator: string;
}

interface PatientJoin {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: string;
  passport_number: string;
  assigned_agent_id: string | null;
  countries: { name: string } | null;
}

const CASE_SELECT =
  "*, patients(full_name, email, phone, date_of_birth, gender, passport_number, assigned_agent_id, countries(name)), operation_types(name), doctors(name), hospitals(name, city), hotels(name, city)";

type Row = Record<string, unknown>;

/** Groups rows by case_id, pre-seeding every id so a case with none stays an empty list. */
function groupByCase<T extends { case_id?: unknown }>(rows: T[], caseIds: string[]) {
  const byCase: Record<string, T[]> = {};
  for (const id of caseIds) byCase[id] = [];
  for (const row of rows) {
    const cid = row.case_id as string;
    (byCase[cid] ??= []).push(row);
  }
  return byCase;
}

/** Derives the per-case document data from a case row and its already-grouped children. */
function buildCaseData(
  caseRow: Row,
  items: Row[],
  paidIn: Row[],
  extras: Row[],
  instructions: Row[]
): CaseDocData {
  const caseId = caseRow.id as string;
  const op = (caseRow.operation_types as { name: string } | null)?.name ?? "";
  const doctor = (caseRow.doctors as { name: string } | null)?.name ?? "";
  const hospital = (caseRow.hospitals as { name: string } | null)?.name ?? "";
  const hotel = (caseRow.hotels as { name: string } | null)?.name ?? "";

  const total = items.reduce((sum, i) => sum + Number(i.price), 0);
  // Deposits are summed via amount_case — each payment's amount already
  // normalized to the quote currency at the rate frozen when it was booked. This
  // used to filter off-currency payments out entirely, which printed a balance
  // that was too high on this customer-facing document.
  const deposit = paidIn.reduce((sum, p) => sum + Number(p.amount_case), 0);

  // The balance math above runs in the case currency, but a patient who paid
  // €500 should see the euros on the document, not only the converted figure.
  // Same word convention as `money()` in CaseBody: "Euros" for EUR, code otherwise.
  const caseCurrencyCode = caseRow.currency as string;
  const fmtIn = (v: number, code: string) =>
    `${v.toLocaleString("en-US")} ${code === "EUR" ? "Euros" : code}`;
  const byCurrency = new Map<string, number>();
  for (const p of paidIn) {
    const code = String(p.currency ?? caseCurrencyCode);
    byCurrency.set(code, (byCurrency.get(code) ?? 0) + Number(p.amount ?? p.amount_case));
  }
  const hasForeign = [...byCurrency.keys()].some((code) => code !== caseCurrencyCode);
  const depositDisplay = hasForeign
    ? [...byCurrency.entries()]
        // Case currency first, then alphabetical, so the order is stable.
        .sort(([a], [b]) =>
          a === caseCurrencyCode ? -1 : b === caseCurrencyCode ? 1 : a.localeCompare(b)
        )
        .map(([code, amount]) => fmtIn(amount, code))
        .join(" + ") + ` (= ${fmtIn(deposit, caseCurrencyCode)})`
    : fmtIn(deposit, caseCurrencyCode);

  // The hotel is booked for the whole stay (arrival → departure). Any nights the
  // patient spends in hospital overlap this window; they are reported separately
  // in the Hospital section, not deducted from the hotel booking.
  const totalNights = nightsBetween(
    caseRow.arrival_date as string | null,
    caseRow.departure_date as string | null
  );
  const hospitalNights = nightsBetween(
    caseRow.hospital_checkin as string | null,
    caseRow.hospital_checkout as string | null
  );

  const packageBullets = [
    doctor ? `Doctor consultation : ${doctor}` : "Doctor consultation",
    "Surgical procedure",
    "Hospital operating room costs",
    ...(hospitalNights ? [`${hospitalNights} night hospital accommodation`] : []),
    ...(totalNights ? [`${totalNights} nights hotel accommodation`] : []),
    "Medication included",
    ...items.map((i) => i.description).filter((d): d is string => Boolean(d)),
    "English speaking medical translator",
    "VIP Airport – Hotel – Hospital transfers",
  ];

  return {
    caseId,
    // The hospital's protocol number is the reference everyone quotes; fall back
    // to the case id for cases recorded before it was captured.
    ref: (caseRow.protocol_number as string | null)?.trim() || caseId.slice(0, 8).toUpperCase(),
    op,
    doctor,
    hospital,
    hotel,
    currency: caseRow.currency === "EUR" ? "Euros" : (caseRow.currency as string),
    arrival_date: (caseRow.arrival_date as string | null) ?? null,
    departure_date: (caseRow.departure_date as string | null) ?? null,
    surgery_date: (caseRow.surgery_date as string | null) ?? null,
    airport: (caseRow.airport as string) ?? "",
    airport_pickup: (caseRow.airport_pickup as string) ?? "",
    totalNights,
    hospitalNights,
    packageBullets,
    total,
    deposit,
    depositDisplay,
    additionalCosts: extras.map((e) => ({
      title: String(e.title ?? ""),
      amount: Number(e.amount ?? 0),
    })),
    instructions: instructions.map((i) => ({
      title: (i.title as string) ?? "",
      body_md: (i.body_md as string) ?? "",
      image_paths: (i.image_paths as string[]) ?? [],
    })),
    coverLine1: [doctor, hospital].filter(Boolean).join("   ·   "),
    coverLine2:
      caseRow.arrival_date && caseRow.departure_date
        ? `${fmtDate(caseRow.arrival_date as string)}  —  ${fmtDate(caseRow.departure_date as string)}`
        : "",
  };
}

async function loadPatient(
  supabase: SupabaseClient,
  patient: PatientJoin | null
): Promise<PatientDocData> {
  let coordinator = "";
  if (patient?.assigned_agent_id) {
    const { data: agent } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", patient.assigned_agent_id)
      .single();
    coordinator = agent?.name ?? "";
  }
  return {
    full_name: patient?.full_name ?? "Patient",
    email: patient?.email ?? "",
    phone: patient?.phone ?? "",
    date_of_birth: patient?.date_of_birth ?? null,
    gender: patient?.gender ?? "",
    passport_number: patient?.passport_number ?? "",
    country: patient?.countries?.name ?? null,
    coordinator,
  };
}

/** Signs every instruction image across every case in one storage round-trip. */
async function signImages(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Record<string, string>> {
  const imageUrls: Record<string, string> = {};
  if (paths.length === 0) return imageUrls;
  const { data: signed } = await supabase.storage
    .from("patient-files")
    .createSignedUrls(paths, 600);
  (signed ?? []).forEach((entry, i) => {
    if (entry.signedUrl) imageUrls[paths[i]] = entry.signedUrl;
  });
  return imageUrls;
}

export interface LoadedCases {
  cases: CaseDocData[];
  patient: PatientDocData;
  imageUrls: Record<string, string>;
}

/**
 * Loads one or more cases of the SAME patient in a fixed number of round-trips,
 * regardless of how many cases were asked for — the batch `.in()` shape rather
 * than N per-case loads, matching `getQuoteItemsForCases`.
 *
 * Returns null when any id is missing or when the ids span more than one
 * patient: a document that silently drops a requested case, or splices two
 * patients under one "Prepared for" name, is worse than a 404.
 */
export async function loadCasesData(
  supabase: SupabaseClient,
  caseIds: string[]
): Promise<LoadedCases | null> {
  if (caseIds.length === 0) return null;

  const { data: caseRows } = await supabase.from("cases").select(CASE_SELECT).in("id", caseIds);
  // `.in()` silently drops ids that don't exist (or that RLS hides).
  if (!caseRows || caseRows.length !== caseIds.length) return null;
  if (new Set(caseRows.map((c) => c.patient_id)).size !== 1) return null;

  const [items, paidIn, extras, instructions] = await Promise.all([
    // Patient-facing: price only. The cost column is never selected here.
    supabase
      .from("quote_items_public")
      .select("case_id, kind, description, price, sort_order")
      .in("case_id", caseIds)
      .order("sort_order"),
    supabase
      .from("payments")
      // amount + currency feed the deposit's original-currency display; the
      // balance math still runs on amount_case alone.
      .select("case_id, amount_case, amount, currency")
      .in("case_id", caseIds)
      .eq("direction", "in")
      .eq("status", "paid"),
    supabase
      .from("case_additional_costs")
      .select("case_id, title, amount, sort_order")
      .in("case_id", caseIds)
      .order("sort_order"),
    supabase
      .from("case_instructions")
      .select("case_id, title, body_md, image_paths")
      .in("case_id", caseIds)
      .order("created_at"),
  ]);

  const itemsBy = groupByCase((items.data ?? []) as Row[], caseIds);
  const paidBy = groupByCase((paidIn.data ?? []) as Row[], caseIds);
  const extrasBy = groupByCase((extras.data ?? []) as Row[], caseIds);
  const instrBy = groupByCase((instructions.data ?? []) as Row[], caseIds);

  // `.in()` does not preserve the caller's order. Sort chronologically so the
  // document reads as an itinerary and the URL's id order is irrelevant.
  const ordered = [...(caseRows as Row[])].sort((a, b) => {
    const at = String(a.arrival_date ?? a.created_at ?? "");
    const bt = String(b.arrival_date ?? b.created_at ?? "");
    return at.localeCompare(bt);
  });

  const cases = ordered.map((row) => {
    const id = row.id as string;
    return buildCaseData(row, itemsBy[id], paidBy[id], extrasBy[id], instrBy[id]);
  });

  const patient = await loadPatient(
    supabase,
    (caseRows[0].patients ?? null) as PatientJoin | null
  );
  const imageUrls = await signImages(
    supabase,
    cases.flatMap((c) => c.instructions.flatMap((i) => i.image_paths))
  );

  return { cases, patient, imageUrls };
}

/** Single-case convenience wrapper over `loadCasesData`. */
export async function loadCaseData(
  supabase: SupabaseClient,
  caseId: string
): Promise<{ case: CaseDocData; patient: PatientDocData; imageUrls: Record<string, string> } | null> {
  const loaded = await loadCasesData(supabase, [caseId]);
  if (!loaded) return null;
  return { case: loaded.cases[0], patient: loaded.patient, imageUrls: loaded.imageUrls };
}

/**
 * The navy cover. One per document, not one per case: `data` is the case whose
 * ref and dates head the page, and `others` (the remaining cases, when there are
 * any) turns the operation line into a list so a multi-case document still says
 * on its face what it contains.
 */
export function CaseCover({
  data,
  patientName,
  others = [],
}: {
  data: CaseDocData;
  patientName: string;
  others?: CaseDocData[];
}) {
  const { theme } = usePdfTheme();
  const issued = fmtDate(new Date().toISOString());
  const all = [data, ...others];
  const treatments =
    others.length === 0
      ? data.op
        ? [data.op]
        : []
      : all.map((c) =>
          [c.op || "Treatment", c.arrival_date ? fmtDate(c.arrival_date) : null]
            .filter(Boolean)
            .join("   ·   ")
        );
  return (
    <CoverPage
      title="Treatment & Reservation"
      titleAccent="Confirmation"
      tagline={theme.company.tagline}
      preparedForLabel="Prepared for"
      patientName={patientName}
      treatments={treatments}
      // The doctor/hospital and date lines belong to a single case, so they're
      // dropped when the cover fronts several.
      line1={others.length === 0 ? data.coverLine1 : ""}
      line2={others.length === 0 ? data.coverLine2 : ""}
      footer={
        (others.length === 0
          ? `Ref ${data.ref}`
          : `${all.length} treatments   ·   Ref ${all.map((c) => c.ref).join(", ")}`) +
        `   ·   Issued ${issued}` +
        (theme.company.website ? `   ·   ${theme.company.website}` : "")
      }
    />
  );
}

/**
 * The cover page rendered from plain values rather than a case record, so the
 * editable document (whose cover attrs are just strings) and the generated one
 * share a single implementation. `CaseCover` above is the adapter from case
 * data onto this.
 */
export function CoverPage({
  title,
  titleAccent,
  tagline,
  preparedForLabel,
  patientName,
  treatments,
  line1,
  line2,
  footer,
}: {
  title: string;
  titleAccent: string;
  tagline: string;
  preparedForLabel: string;
  patientName: string;
  treatments: string[];
  line1: string;
  line2: string;
  footer: string;
}) {
  const { theme } = usePdfTheme();
  return (
    <Page size="A4" style={{ backgroundColor: theme.coverBg, padding: 28, fontFamily: SANS }}>
      <View
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: theme.coverAccent,
          alignItems: "center",
          paddingVertical: 64,
          paddingHorizontal: 48,
        }}
      >
        {/* Brand */}
        <Mark scale={1.7} variant="cover" />
        <Text
          style={{
            fontSize: 8.5,
            color: theme.coverAccentLight,
            letterSpacing: 3.5,
            marginTop: 10,
            textTransform: "uppercase",
          }}
        >
          {tagline}
        </Text>

        <View style={{ flex: 1 }} />

        {/* Title */}
        <Text
          style={{
            fontSize: 30,
            color: "#ffffff",
            fontFamily: SERIF,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: 30,
            color: theme.coverAccent,
            fontFamily: SERIF,
            fontWeight: 700,
            textAlign: "center",
            marginTop: 6,
          }}
        >
          {titleAccent}
        </Text>
        <View style={{ marginTop: 24 }}>
          <CoverOrnament width={210} />
        </View>

        {/* Patient */}
        <Text
          style={{
            fontSize: 9,
            color: theme.coverAccent,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginTop: 44,
          }}
        >
          {preparedForLabel}
        </Text>
        <Text
          style={{
            fontSize: 26,
            color: "#ffffff",
            fontFamily: SERIF,
            fontWeight: 700,
            marginTop: 10,
            textAlign: "center",
          }}
        >
          {patientName}
        </Text>
        {/* One case names its operation; several list them, so the cover states
            what the document actually contains. */}
        {treatments.length === 1 ? (
          <Text
            style={{
              fontSize: 13,
              color: theme.coverAccentLight,
              fontFamily: SERIF,
              fontStyle: "italic",
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {treatments[0]}
          </Text>
        ) : treatments.length > 1 ? (
          <View style={{ marginTop: 14, alignItems: "center" }}>
            {treatments.map((t, i) => (
              <Text
                key={i}
                style={{
                  fontSize: 12,
                  color: theme.coverAccentLight,
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  marginTop: i === 0 ? 0 : 5,
                  textAlign: "center",
                }}
              >
                {t}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        {line1 ? (
          <Text style={{ fontSize: 9.5, color: "#e8ecf5", letterSpacing: 0.5, textAlign: "center" }}>
            {line1}
          </Text>
        ) : null}
        {line2 ? (
          <Text
            style={{
              fontSize: 9.5,
              color: theme.coverAccentLight,
              letterSpacing: 0.8,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            {line2}
          </Text>
        ) : null}

        <View style={{ marginVertical: 22, width: 26, height: 1, backgroundColor: theme.coverAccent }} />

        <Text style={{ fontSize: 8, color: theme.coverAccentLight, letterSpacing: 1.2, opacity: 0.9 }}>
          {footer}
        </Text>
      </View>
    </Page>
  );
}

/**
 * The divider between cases in a combined document. Deliberately loud — a navy
 * band with the case number, operation and dates — because with one cover page
 * for the whole file this is the only thing telling a reader where one treatment
 * ends and the next begins. `break` starts each case on a fresh page so the
 * boundary is never mid-page.
 */
export function CaseDivider({
  data,
  index,
  total,
  breakBefore,
}: {
  data: CaseDocData;
  index: number;
  total: number;
  breakBefore?: boolean;
}) {
  const { theme } = usePdfTheme();
  const dates =
    data.arrival_date && data.departure_date
      ? `${fmtDate(data.arrival_date)} — ${fmtDate(data.departure_date)}`
      : data.arrival_date
        ? fmtDate(data.arrival_date)
        : "";
  return (
    <View break={breakBefore} wrap={false} style={{ marginTop: 4, marginBottom: 16 }}>
      <View style={{ height: 2, backgroundColor: theme.coverAccent, marginBottom: 10, width: 46 }} />
      <Text
        style={{
          fontSize: 8.5,
          color: theme.coverAccentDark,
          letterSpacing: 2.4,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Treatment {index} of {total}
      </Text>
      {/* The title and its meta line are ONE Text with a nested Text, not two
          siblings. As siblings react-pdf laid the second baseline only ~9.7pt
          below a 19pt title (measured off the rendered PDF), so the dates ran
          through the title's descenders; neither lineHeight, a fixed-height
          wrapper, nor marginBottom moved that. Inside a single Text the line
          breaking is the text engine's job and the lines can't collide. */}
      <Text style={{ fontFamily: SERIF, fontWeight: 700, color: theme.coverBg, lineHeight: 1.75 }}>
        <Text style={{ fontSize: 19 }}>{data.op || "Treatment"}</Text>
        {"\n"}
        <Text style={{ fontSize: 9, fontFamily: SANS, fontWeight: 400, color: MUTED }}>
          {[dates, data.hospital, `Ref ${data.ref}`].filter(Boolean).join("   ·   ")}
        </Text>
      </Text>
      <View style={{ height: 1, backgroundColor: TABLE_LINE, marginTop: 10 }} />
    </View>
  );
}

/** Patient-level identity block — rendered once per document. */
export function PatientInfoSection({
  patient,
  number,
}: {
  patient: PatientDocData;
  number: number | string;
}) {
  return (
    <TableSection number={number} title="Patient Information" wrap={false}>
      <TRow label="Full name" value={patient.full_name} />
      <TRow label="Date of birth" value={fmtDate(patient.date_of_birth)} />
      <TRow label="Gender" value={fmtGender(patient.gender)} />
      <TRow label="Passport number" value={patient.passport_number} />
      <TRow label="Country" value={patient.country} />
      <TRow label="Phone / WhatsApp" value={patient.phone} />
      <TRow label="E-mail" value={patient.email} last />
    </TableSection>
  );
}

/**
 * The per-case body: travel, hotel, hospital, package, payment, extras and
 * instructions. Repeats once per case in a combined document.
 *
 * `sectionPrefix` drives the numbering: omitted gives a flat 2, 3, 4… (the
 * single-case document, where Patient Information is 1); a prefix gives 2.1,
 * 2.2… so a reader can tell which case a section belongs to.
 */
export function CaseBody({
  data,
  imageUrls,
  sectionPrefix,
}: {
  data: CaseDocData;
  imageUrls: Record<string, string>;
  sectionPrefix?: number | string;
}) {
  const { theme, styles: s } = usePdfTheme();
  const n = (i: number) => (sectionPrefix == null ? String(i + 1) : `${sectionPrefix}.${i}`);
  const money = (v: number) => `${v.toLocaleString("en-US")} ${data.currency}`;

  return (
    <View>
      <TableSection number={n(1)} title="Travel Information" wrap={false}>
        <TRow label="Arrival date" value={fmtDate(data.arrival_date)} />
        <TRow label="Departure date" value={fmtDate(data.departure_date)} />
        <TRow label="Airport" value={data.airport} />
        <TRow label="Airport pickup" value={data.airport_pickup} last />
      </TableSection>

      {/* Hotel is booked for the whole stay (arrival → departure) */}
      <TableSection number={n(2)} title="Hotel Information" wrap={false}>
        <TRow label="Hotel name" value={data.hotel} />
        <TRow label="Check-in date" value={fmtDate(data.arrival_date)} />
        <TRow label="Check-out date" value={fmtDate(data.departure_date)} />
        <TRow
          label="Total nights"
          value={data.totalNights ? `${data.totalNights} nights` : null}
          last
        />
      </TableSection>

      <TableSection number={n(3)} title="Hospital Information" wrap={false}>
        <TRow label="Hospital name" value={data.hospital} />
        <TRow label="Operation date" value={fmtDate(data.surgery_date)} />
        <TRow
          label="Hospital stay"
          value={
            data.hospitalNights
              ? `${data.hospitalNights} night${data.hospitalNights > 1 ? "s" : ""} accommodation included`
              : null
          }
          last
        />
      </TableSection>

      {/* Kept unwrapped like every other section: `tableBody` carries the card
          border, which react-pdf cannot reflow across a page break — letting it
          wrap makes the bullets spill over the next section instead of moving.
          The trade-off is that a very long bullet list is silently clipped, but
          each case starts on a fresh page (CaseDivider) so there is a full page
          of room before that bites. */}
      <TableSection number={n(4)} title="Package Details" wrap={false}>
        <View style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
          <Text style={{ fontWeight: 700, color: INK, marginBottom: 8, fontSize: 10.5 }}>
            Procedure: {data.op || "Treatment package"}
          </Text>
          {/* Two explicit columns, NOT one `flexWrap: "wrap"` row. react-pdf
              under-measures a wrapped flex container — the height it reports is
              roughly one row's worth — so the bullets used to spill out of this
              card and collide with the section below. Splitting the list into
              two non-wrapping columns keeps every container single-line, which
              it measures correctly. */}
          <View style={{ flexDirection: "row" }}>
            {[0, 1].map((col) => (
              <View key={col} style={{ width: "50%", paddingRight: 12 }}>
                {data.packageBullets
                  .filter((_, i) => i % 2 === col)
                  .map((b, i) => (
                    <Text key={i} style={{ color: TEXT, lineHeight: 1.4, marginBottom: 4 }}>
                      <Text style={{ color: theme.coverAccent }}>• </Text>
                      {b}
                    </Text>
                  ))}
              </View>
            ))}
          </View>
        </View>
      </TableSection>

      <TableSection number={n(5)} title="Payment Information" wrap={false}>
        <TRow label="Total package price" value={money(data.total)} />
        {/* Preformatted: shows the original currency when a deposit was paid
            off-currency ("500 Euros (= 540 USD)"), plain money() otherwise. */}
        <TRow label="Deposit paid" value={data.depositDisplay} />
        <View style={[s.tRowLast, { backgroundColor: theme.coverSoftBg }]}>
          <Text style={[s.tLabel, { backgroundColor: "transparent", color: theme.coverAccentDark }]}>
            Remaining balance
          </Text>
          <Text style={[s.tValue, { fontSize: 12, fontWeight: 700, color: theme.coverBg }]}>
            {money(Math.max(data.total - data.deposit, 0))}
          </Text>
        </View>
      </TableSection>
      <Text style={{ fontSize: 8.5, marginTop: -12, marginBottom: 20, color: MUTED }}>
        Payment method: Cash / Bank Transfer / Card. Remaining balance is to be paid upon arrival
        in Istanbul before the procedure.
      </Text>

      {/* Extras quoted alongside the package but settled separately (0020).
          Omitted entirely when empty, and never folded into the total above. */}
      {data.additionalCosts.length > 0 && (
        <>
          <TableSection number={n(6)} title="Additional Costs" wrap={false}>
            {data.additionalCosts.map((c, i) => (
              <TRow
                key={i}
                label={c.title || "—"}
                value={money(c.amount)}
                last={i === data.additionalCosts.length - 1}
              />
            ))}
          </TableSection>
          {/* Load-bearing: without this a patient reading a total immediately
              followed by more prices assumes the total includes them. */}
          <Text style={{ fontSize: 8.5, marginTop: -12, marginBottom: 20, color: MUTED }}>
            Additional costs are quoted separately and are not included in the total package price
            above.
          </Text>
        </>
      )}

      {/* Instructions */}
      {data.instructions.map((ins, idx) => (
        <View key={idx}>
          <Text style={s.instrHeading} minPresenceAhead={40}>
            {ins.title}
          </Text>
          <PdfMarkdown md={ins.body_md} scale={0.95} />
          {ins.image_paths.filter((p) => imageUrls[p]).length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }} wrap={false}>
              {ins.image_paths
                .filter((p) => imageUrls[p])
                .map((p, k) => (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image key={k} src={imageUrls[p]} style={{ width: 150, marginBottom: 6 }} />
                ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** Company + coordinator block — rendered once per document. */
export function CompanySection({
  patient,
  number,
}: {
  patient: PatientDocData;
  number: number | string;
}) {
  const { theme } = usePdfTheme();
  return (
    <View style={{ marginTop: 20 }}>
      <TableSection number={number} title={theme.company.name} wrap={false}>
        <TRow label="Patient coordinator" value={patient.coordinator} />
        <TRow label="WhatsApp" value={theme.company.whatsapp} />
        <TRow label="Website" value={theme.company.website} />
        <TRow label="Location" value={theme.company.location} last />
      </TableSection>
    </View>
  );
}

/** Closing acknowledgement + two-column signature block — once per document. */
export function ConfirmationBlock() {
  const { theme, styles: s } = usePdfTheme();
  return (
    <View wrap={false} style={{ marginTop: 4 }}>
      <Text style={s.instrHeading}>Confirmation</Text>
      <Text style={{ marginBottom: 26, lineHeight: 1.5, color: TEXT }}>
        By confirming this document, the patient acknowledges the reservation and treatment plan
        organized by {theme.company.name}.
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 34 }}>
        <View style={{ flex: 1 }}>
          <View style={{ borderTopWidth: 1, borderTopColor: TABLE_LINE, marginBottom: 5 }} />
          <Text style={{ color: MUTED, fontSize: 8.5 }}>Patient Signature</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ borderTopWidth: 1, borderTopColor: TABLE_LINE, marginBottom: 5 }} />
          <Text style={{ color: MUTED, fontSize: 8.5 }}>Date</Text>
        </View>
      </View>
    </View>
  );
}

export { PdfFooter };

/**
 * The file gets forwarded to patients and hospitals, so it downloads as just
 * the patient's name. HTTP headers are Latin-1 only — a Turkish "ı ş ğ" or a
 * curly apostrophe in a raw filename= throws a ByteString conversion error —
 * so the real name goes in the RFC 5987 filename* (percent-encoded UTF-8) and
 * filename= carries a stripped ASCII fallback for clients that ignore it.
 */
export function pdfFilenameHeaders(name: string): Record<string, string> {
  const safe = name.replace(/[\\/:*?"<>|\r\n]/g, " ").trim() || "Patient";
  const ascii = safe.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").trim() || "patient";
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(
      `${safe}.pdf`
    )}`,
  };
}
