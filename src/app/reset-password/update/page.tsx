import Link from "next/link";
import { UpdatePasswordForm } from "./update-form";

export const metadata = { title: "Set new password" };

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight">
            <span className="brand-gradient-text">TurkCure</span>
          </div>
          <p className="mt-2 text-sm text-muted">Choose a new password</p>
        </div>
        <UpdatePasswordForm />
        <p className="mt-6 text-center text-xs text-muted-light">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
