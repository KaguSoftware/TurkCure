"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { INTRO_COOKIE } from "@/components/shell/intro-overlay";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    // The handle_new_user trigger provisions a profile from this metadata
    // (name here, role defaults to "agent").
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // If email confirmation is enabled there's no session yet — ask them to
    // confirm. Otherwise we're signed straight in.
    if (!data.session) {
      setSent(true);
      setLoading(false);
      return;
    }
    document.cookie = `${INTRO_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `turkcure_session_start=${Date.now()}; path=/; max-age=${30 * 24 * 60 * 60}; samesite=lax`;
    router.push("/dashboard");
    router.refresh();
  }

  if (sent) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5 text-center">
          <p className="text-sm font-medium">Check your email</p>
          <p className="text-xs text-muted">
            We sent a confirmation link to <span className="font-medium">{email}</span>. Click it to
            activate your account, then sign in.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Full name">
            <Input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@turkcure.com"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </Field>
          <Field label="Confirm password">
            <Input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
