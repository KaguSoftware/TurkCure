import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight">
            <span className="brand-gradient-text">TurkCure</span>
          </div>
          <p className="mt-2 text-sm text-muted">Internal operations system</p>
        </div>
        <LoginForm />
        <div className="mt-4 flex items-center justify-between text-xs">
          <Link href="/reset-password" className="text-muted hover:text-foreground">
            Forgot password?
          </Link>
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
