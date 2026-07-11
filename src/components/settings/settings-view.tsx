"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, Moon, Sun, Upload, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { UsersManager } from "@/components/settings/users-manager";
import {
  updateOwnProfile,
  updateOwnAccentTheme,
  changeOwnPassword,
  updateOwnAvatar,
  removeOwnAvatar,
} from "@/lib/actions/account";
import { ACCENT_THEMES, type AccentTheme, type Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

// Swatch colors per accent; default shows the brand blue → green gradient.
const SWATCH: Record<AccentTheme, string> = {
  default: "linear-gradient(135deg, #2563eb, #10b981)",
  violet: "linear-gradient(135deg, #7c3aed, #a78bfa)",
  emerald: "linear-gradient(135deg, #059669, #34d399)",
  amber: "linear-gradient(135deg, #d97706, #fbbf24)",
};

// Mirrors ACCENT_CLASS in the (app) layout, which owns the server-rendered class.
const ACCENT_CLASS: Record<AccentTheme, string | null> = {
  default: null,
  violet: "theme-violet",
  emerald: "theme-emerald",
  amber: "theme-amber",
};

function applyAccentClass(value: AccentTheme) {
  const root = document.querySelector("[data-accent-root]");
  if (!root) return;
  for (const cls of Object.values(ACCENT_CLASS)) if (cls) root.classList.remove(cls);
  const next = ACCENT_CLASS[value];
  if (next) root.classList.add(next);
}

export function SettingsView({ profile, users }: { profile: Profile; users: Profile[] | null }) {
  const isAdmin = profile.role === "admin";
  const tabs = isAdmin ? ["Profile", "Appearance", "Team"] : ["Profile", "Appearance"];
  const [tab, setTab] = React.useState(tabs[0]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "pressable -mb-px border-b-2 px-4 py-2.5 text-sm font-medium cursor-pointer",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Profile" && <ProfileTab profile={profile} />}
      {tab === "Appearance" && <AppearanceTab profile={profile} />}
      {tab === "Team" && isAdmin && users && (
        <UsersManager users={users} currentUserId={profile.id} />
      )}
    </div>
  );
}

function ProfileTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = React.useState(profile.name);
  const [savingName, setSavingName] = React.useState(false);

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [savingPassword, setSavingPassword] = React.useState(false);

  async function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    const r = await updateOwnProfile(name);
    setSavingName(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Profile updated.");
      router.refresh();
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New passwords don't match.");
      return;
    }
    setSavingPassword(true);
    const r = await changeOwnPassword(current, next);
    setSavingPassword(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Password changed.");
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = React.useState(false);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    const fd = new FormData();
    fd.set("avatar", file);
    const r = await updateOwnAvatar(fd);
    setAvatarBusy(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Profile picture updated.");
      router.refresh();
    }
  }

  async function onRemoveAvatar() {
    setAvatarBusy(true);
    const r = await removeOwnAvatar();
    setAvatarBusy(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Profile picture removed.");
      router.refresh();
    }
  }

  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
              <img
                src={profile.avatar_url}
                alt="Profile picture"
                className="size-16 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="brand-gradient-bg flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white">
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  pending={avatarBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload /> Upload photo
                </Button>
                {profile.avatar_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={avatarBusy}
                    onClick={onRemoveAvatar}
                  >
                    <Trash2 /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">JPG, PNG, WebP or GIF, up to 2 MB.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={onPickAvatar}
            />
          </div>

          <form onSubmit={onSaveName} className="space-y-4">
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Email">
              <Input value={profile.email ?? ""} disabled />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" pending={savingName} disabled={name.trim() === profile.name}>
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangePassword} className="space-y-4">
            <Field label="Current password">
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={8}
                placeholder="Min 8 characters"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" pending={savingPassword}>
                Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AppearanceTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [accent, setAccent] = React.useState<AccentTheme>(profile.accent_theme);
  const [savingAccent, setSavingAccent] = React.useState<AccentTheme | null>(null);
  // useTheme is undefined until mounted; avoid a hydration mismatch on the toggle.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  async function pickAccent(value: AccentTheme) {
    if (value === accent || savingAccent) return;
    const previous = accent;
    // Swap the accent class on the layout root immediately; the server action
    // persists it and router.refresh() re-renders with the same class.
    applyAccentClass(value);
    setAccent(value);
    setSavingAccent(value);
    const r = await updateOwnAccentTheme(value);
    setSavingAccent(null);
    if (r.error) {
      applyAccentClass(previous);
      setAccent(previous);
      toast.error(r.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="inline-flex rounded-lg border border-border p-1">
            {(["light", "dark"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setTheme(m)}
                className={cn(
                  "pressable flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer capitalize",
                  mounted && theme === m
                    ? "bg-primary-soft text-primary"
                    : "text-muted hover:text-foreground"
                )}
              >
                {m === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                {m}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accent color</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {ACCENT_THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => pickAccent(t.value)}
                disabled={savingAccent !== null}
                title={t.label}
                className="pressable flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full",
                    accent === t.value && "ring-2 ring-offset-2 ring-primary ring-offset-surface"
                  )}
                  style={{ background: SWATCH[t.value] }}
                >
                  {accent === t.value && <Check className="size-4 text-white" />}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    accent === t.value ? "font-medium text-foreground" : "text-muted"
                  )}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Changes the highlight color across the whole app, on every device you sign in from.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
