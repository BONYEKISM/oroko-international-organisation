"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import {
  registerSchema,
  type RegisterFormInput,
  type RegisterInput,
} from "@/lib/validations/auth";
import { registerUser } from "@/actions/auth.actions";
import { confirmMembershipPayment } from "@/actions/membership-payment.actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

export function RegisterForm({
  duesAmount,
  duesCurrency,
}: {
  duesAmount: number;
  duesCurrency: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<"stripe" | "paypal">("stripe");
  const [payment, setPayment] = useState<{ clientSecret: string; membershipId: string } | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput, undefined, RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    const result = await registerUser({ ...data, paymentProvider });

    if (!result.success) {
      setServerError(result.error ?? "Registration failed");
      return;
    }

    if (result.approvalUrl) {
      window.location.assign(result.approvalUrl);
      return;
    }
    if (result.clientSecret && result.membershipId) {
      setPayment({ clientSecret: result.clientSecret, membershipId: result.membershipId });
      return;
    }
    setServerError("Your account was created, but checkout could not be started. Sign in to retry.");
  };

  const finishRegistration = () => {
    setSuccess(true);
    setTimeout(
      () =>
        router.push(
          `/auth/login?registered=true&callbackUrl=${encodeURIComponent("/portal/profile?onboarding=1")}`
        ),
      2200
    );
  };

  if (payment) {
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: payment.clientSecret, appearance: { theme: "stripe" } }}
      >
        <StripeMembershipPayment
          membershipId={payment.membershipId}
          amount={duesAmount}
          currency={duesCurrency}
          onSuccess={finishRegistration}
        />
      </Elements>
    );
  }

  if (success) {
    return (
      <div className="text-center py-6 space-y-3">
        <CheckCircle className="size-12 text-oroko-gold mx-auto" />
        <p className="text-white font-heading text-xl">Payment Complete</p>
        <p className="text-white/50 text-sm">
          Your dues are paid. Sign in to complete your membership profile before admin review.
          Redirecting you to sign in…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && (
        <div className="rounded-sm bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {serverError}
          {(serverError.includes("Sign in") || serverError.includes("already exists")) && (
            <div className="mt-2">
              <Link href="/auth/login" className="font-semibold underline">Sign in to continue</Link>
            </div>
          )}
        </div>
      )}

      {/* Name row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-white/70 text-xs tracking-wider uppercase">
            First Name
          </Label>
          <Input
            id="firstName"
            type="text"
            autoComplete="given-name"
            placeholder="First name"
            {...register("firstName")}
            className={cn(
              "bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:border-oroko-gold focus-visible:ring-oroko-gold/20",
              errors.firstName && "border-destructive"
            )}
          />
          {errors.firstName && (
            <p className="text-destructive text-xs">{errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-white/70 text-xs tracking-wider uppercase">
            Last Name
          </Label>
          <Input
            id="lastName"
            type="text"
            autoComplete="family-name"
            placeholder="Last name"
            {...register("lastName")}
            className={cn(
              "bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:border-oroko-gold focus-visible:ring-oroko-gold/20",
              errors.lastName && "border-destructive"
            )}
          />
          {errors.lastName && (
            <p className="text-destructive text-xs">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-3 border-y border-white/10 py-4">
        <div>
          <p className="text-white/70 text-xs tracking-wider uppercase">Annual membership dues</p>
          <p className="text-white font-semibold mt-1">
            {new Intl.NumberFormat(undefined, { style: "currency", currency: duesCurrency }).format(duesAmount)} / year
          </p>
          <p className="text-white/40 text-xs mt-1">Charged once during signup. Renewals are handled manually.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["stripe", "paypal"] as const).map((provider) => (
            <button
              key={provider}
              type="button"
              aria-pressed={paymentProvider === provider}
              onClick={() => setPaymentProvider(provider)}
              className={cn(
                "py-2.5 text-sm font-medium border rounded-sm capitalize transition-colors",
                paymentProvider === provider
                  ? "border-oroko-gold bg-oroko-gold/10 text-oroko-gold"
                  : "border-white/15 text-white/60 hover:border-oroko-gold/40"
              )}
            >
              {provider === "paypal" ? "PayPal" : "Card (Stripe)"}
            </button>
          ))}
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="reg-email" className="text-white/70 text-xs tracking-wider uppercase">
          Email Address
        </Label>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register("email")}
          className={cn(
            "bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:border-oroko-gold focus-visible:ring-oroko-gold/20",
            errors.email && "border-destructive"
          )}
        />
        {errors.email && (
          <p className="text-destructive text-xs">{errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <Label htmlFor="reg-password" className="text-white/70 text-xs tracking-wider uppercase">
          Password
        </Label>
        <div className="relative">
          <Input
            id="reg-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            {...register("password")}
            className={cn(
              "bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:border-oroko-gold focus-visible:ring-oroko-gold/20 pr-10",
              errors.password && "border-destructive"
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-destructive text-xs">{errors.password.message}</p>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-white/70 text-xs tracking-wider uppercase">
          Confirm Password
        </Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Repeat your password"
            {...register("confirmPassword")}
            className={cn(
              "bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:border-oroko-gold focus-visible:ring-oroko-gold/20 pr-10",
              errors.confirmPassword && "border-destructive"
            )}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-destructive text-xs">{errors.confirmPassword.message}</p>
        )}
      </div>

      <p className="text-white/30 text-xs leading-relaxed">
        By creating an account you agree to OROKO&apos;s membership terms and conditions.
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2.5 py-3 bg-oroko-gold text-oroko-black text-xs tracking-[0.2em] uppercase font-bold hover:bg-oroko-gold-light disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 rounded-sm"
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {isSubmitting ? "Creating account…" : "Create Account"}
      </button>
    </form>
  );
}

function StripeMembershipPayment({
  membershipId,
  amount,
  currency,
  onSuccess,
}: {
  membershipId: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setError(null);
    const confirmation = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (confirmation.error) {
      setError(confirmation.error.message ?? "Payment failed.");
      setIsProcessing(false);
      return;
    }
    const result = await confirmMembershipPayment(membershipId);
    if (!result.success) {
      setError(result.error ?? "Payment was received but could not be confirmed.");
      setIsProcessing(false);
      return;
    }
    setIsProcessing(false);
    onSuccess();
  }

  return (
    <form onSubmit={submitPayment} className="space-y-5">
      <p className="text-white/60 text-sm">
        Complete your annual membership payment of {currency} {amount.toFixed(2)}.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full flex items-center justify-center gap-2 py-3 bg-oroko-gold text-oroko-black text-xs tracking-[0.2em] uppercase font-bold hover:bg-oroko-gold-light disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 rounded-sm"
      >
        {isProcessing && <Loader2 className="size-4 animate-spin" />}
        {isProcessing ? "Processing…" : "Pay annual dues"}
      </button>
      <p className="text-xs text-center text-white/40">
        Secured by Stripe. Card details are not stored by OROKO International.
      </p>
    </form>
  );
}
