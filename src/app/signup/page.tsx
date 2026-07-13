import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight">
            <span className="brand-gradient-text">TurkCure</span>
          </div>
          <p className="mt-2 text-sm text-muted">Create your account</p>
        </div>
        <SignupForm />
        <p className="mt-6 text-center text-xs text-muted-light">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
