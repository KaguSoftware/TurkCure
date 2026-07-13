import Link from "next/link";
import { LoginForm } from "./login-form";
import { AuthError } from "@/components/auth/auth-error";
import { authErrorFromCode } from "@/lib/auth/errors";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = authErrorFromCode(error);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight">
            <span className="brand-gradient-text">TurkCure</span>
          </div>
          <p className="mt-2 text-sm text-muted">Internal operations system</p>
        </div>
        {errorMessage && (
          <div className="mb-4">
            <AuthError message={errorMessage} />
          </div>
        )}
        <LoginForm />
        <div className="mt-4 text-center text-xs">
          <Link href="/reset-password" className="text-muted hover:text-foreground">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
