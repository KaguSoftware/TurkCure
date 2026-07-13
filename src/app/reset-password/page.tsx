import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight">
            <span className="brand-gradient-text">TurkCure</span>
          </div>
          <p className="mt-2 text-sm text-muted">Reset your password</p>
        </div>
        <ResetForm />
        <p className="mt-6 text-center text-xs text-muted-light">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
