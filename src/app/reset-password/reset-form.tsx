"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function ResetForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password/update`,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5 text-center">
          <p className="text-sm font-medium">Check your email</p>
          <p className="text-xs text-muted">
            If an account exists for <span className="font-medium">{email}</span>, we sent a link to
            set a new password.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@turkcure.com"
            />
          </Field>
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending link…" : "Send reset link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
