import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/common/Logo";
import { ForgotPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata: Metadata = {
  title: "Forgot Password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <div className="bg-white/4 border border-white/10 rounded-sm p-8 sm:p-10 backdrop-blur-sm">
        <div className="flex justify-center mb-8">
          <Logo variant="light" size="lg" />
        </div>
        <div className="text-center mb-8 space-y-2">
          <h1 className="font-heading text-3xl font-semibold text-white">Reset your password</h1>
          <p className="text-white/50 text-sm">
            Enter your account email and we’ll send a reset link if it matches an active account.
          </p>
        </div>
        <div className="oroko-divider mb-8" />
        <ForgotPasswordForm />
      </div>
      <p className="text-center mt-6 text-sm">
        <Link href="/auth/login" className="text-white/50 hover:text-white transition-colors">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
