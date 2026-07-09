"use client";

import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { attachInstruction, updateInstruction, removeInstruction } from "@/lib/actions/cases";
import type { Case, CaseInstruction, Patient } from "@/lib/types";

export function InstructionsTab({
  patient,
  cases,
  instructions,
  templates,
}: {
  patient: Patient;
  cases: Case[];
  instructions: CaseInstruction[];
  templates: { id: string; title: string }[];
}) {
  const activeCase = cases[0] ?? null;
  const [templateId, setTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!activeCase) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted">
          Create a case first — instructions are attached to the case and included in the patient PDF.
        </CardContent>
      </Card>
    );
  }

  async function onAttach() {
    if (!templateId) return;
    setBusy(true);
    const r = await attachInstruction(patient.id, activeCase!.id, templateId);
    setBusy(false);
    if (r.error) alert(r.error);
    else setTemplateId("");
  }

  return (
    <div className="space-y-4">
      <div className="flex max-w-md items-end gap-2">
        <div className="flex-1">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={onAttach} disabled={!templateId || busy}>
          <Plus /> Attach
        </Button>
      </div>

      {instructions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            No instructions attached yet. Attach a template above — you can customize the text per
            patient before generating the PDF.
          </CardContent>
        </Card>
      )}

      {instructions.map((ins) => (
        <InstructionCard key={ins.id} patientId={patient.id} instruction={ins} />
      ))}
    </div>
  );
}

function InstructionCard({
  patientId,
  instruction,
}: {
  patientId: string;
  instruction: CaseInstruction;
}) {
  const [body, setBody] = React.useState(instruction.body_md);
  const [saving, setSaving] = React.useState(false);
  const dirty = body !== instruction.body_md;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{instruction.title}</CardTitle>
        <div className="flex gap-1">
          {dirty && (
            <Button
              size="sm"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const r = await updateInstruction(patientId, instruction.id, body);
                setSaving(false);
                if (r.error) alert(r.error);
              }}
            >
              <Save /> {saving ? "Saving…" : "Save"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove"
            className="hover:text-danger"
            onClick={async () => {
              if (!confirm("Remove these instructions from the case?")) return;
              const r = await removeInstruction(patientId, instruction.id);
              if (r.error) alert(r.error);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="font-mono text-xs"
        />
      </CardContent>
    </Card>
  );
}
