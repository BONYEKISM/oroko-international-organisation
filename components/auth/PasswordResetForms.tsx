"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset, resetPassword } from "@/actions/auth.actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClassName =
  "bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:border-oroko-gold focus-visible:ring-oroko-gold/20";

const submitClassName =
  "w-full flex items-center justify-center py-3 bg-oroko-gold text-oroko-black text-xs tracking-[0.2em] uppercase font-bold hover:bg-oroko-gold-light disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 rounded-sm";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      if (!result.success) {
        setError(result.error ?? "Unable to process the request.");
        return;
      }
      setMessage(result.message ?? "If an account exists, we’ll email a reset link shortly.");
    } catch {
      setError("Unable to process the request right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p role="alert" className="rounded-sm bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="rounded-sm bg-oroko-green/10 border border-oroko-green/20 px-4 py-3 text-sm text-white/80">{message}</p>}
      <div className="space-y-2">
        <Label htmlFor="reset-request-email" className="text-white/70 text-xs tracking-wider uppercase">
          Email Address
        </Label>
        <Input
          id="reset-request-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={254}
          className={fieldClassName}
        />
      </div>
      <button type="submit" disabled={isSubmitting} className={submitClassName}>
        {isSubmitting ? "Sending…" : "Send Reset Link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await resetPassword(token, password, confirmPassword);
      if (!result.success) {
        setError(result.error ?? "Unable to reset the password.");
        return;
      }
      setIsComplete(true);
    } catch {
      setError("Unable to reset the password right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-white/70">This password reset link is invalid or expired.</p>
        <Link href="/auth/forgot-password" className="text-oroko-gold hover:text-oroko-gold-light text-sm">
          Request another reset link
        </Link>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="space-y-4 text-center">
        <p role="status" className="text-sm text-white/80">Your password has been updated.</p>
        <Link href="/auth/login" className="text-oroko-gold hover:text-oroko-gold-light text-sm">
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p role="alert" className="rounded-sm bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="reset-new-password" className="text-white/70 text-xs tracking-wider uppercase">
          New Password
        </Label>
        <Input
          id="reset-new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          maxLength={100}
          className={fieldClassName}
        />
        <p className="text-xs text-white/40">Use at least 8 characters, including uppercase, lowercase, and a number.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-confirm-password" className="text-white/70 text-xs tracking-wider uppercase">
          Confirm New Password
        </Label>
        <Input
          id="reset-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          maxLength={100}
          className={fieldClassName}
        />
      </div>
      <button type="submit" disabled={isSubmitting} className={submitClassName}>
        {isSubmitting ? "Saving…" : "Set New Password"}
      </button>
    </form>
  );
}
