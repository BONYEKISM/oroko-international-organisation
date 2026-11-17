"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2, CheckCircle, Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmEventPayment, registerForEvent } from "@/actions/event.actions";
import { cn } from "@/lib/utils";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

const schema = z.object({
  attendeeName: z.string().min(2, "Name is required").max(100),
  attendeeEmail: z.string().email("Valid email required"),
  quantity: z.number().int().min(1).max(10),
  notes: z.string().max(300).optional(),
});

type FormValues = z.infer<typeof schema>;

type TicketType = {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  isFree: boolean;
  isMembersOnly: boolean;
  spotsLeft?: number;
};

type Props = {
  eventId: string;
  ticketTypes: TicketType[];
  defaultName?: string;
  defaultEmail?: string;
};

export function EventRegistrationForm({ eventId, ticketTypes, defaultName = "", defaultEmail = "" }: Props) {
  const available = ticketTypes.filter((t) => t.isMembersOnly === false || !!defaultEmail);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(available[0] ?? null);
  const [result, setResult] = useState<{ code: string; name: string } | null>(null);
  const [payment, setPayment] = useState<{
    clientSecret: string;
    registrationId: string;
    code: string;
    name: string;
  } | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"stripe" | "paypal">("stripe");
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { attendeeName: defaultName, attendeeEmail: defaultEmail, quantity: 1 },
  });

  const qty = watch("quantity") || 1;
  const totalPrice = selectedTicket ? selectedTicket.price * qty : 0;

  const onSubmit = async (data: FormValues) => {
    if (!selectedTicket) return;
    setError(null);
    try {
      const res = await registerForEvent({
        eventId,
        ticketTypeId: selectedTicket.id,
        paymentProvider,
        ...data,
      });
      if (!res.success) {
        setError(res.error ?? "Registration failed");
        return;
      }
      if (res.approvalUrl) {
        window.location.assign(res.approvalUrl);
        return;
      }
      if (res.clientSecret && res.registrationId && res.registrationCode) {
        setPayment({
          clientSecret: res.clientSecret,
          registrationId: res.registrationId,
          code: res.registrationCode,
          name: data.attendeeName,
        });
        return;
      }
      setResult({ code: res.registrationCode!, name: data.attendeeName });
    } catch (submitError) {
      console.error("[EventRegistrationForm]", submitError);
      setError("Could not start registration. Please try again.");
    }
  };

  if (payment) {
    return (
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: payment.clientSecret, appearance: { theme: "stripe" } }}
      >
        <StripeTicketPayment
          payment={payment}
          onSuccess={() => setResult({ code: payment.code, name: payment.name })}
        />
      </Elements>
    );
  }

  if (result) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="size-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
          <CheckCircle className="size-8 text-emerald-500" />
        </div>
        <div>
          <p className="font-heading text-xl font-bold text-oroko-black">You&apos;re registered!</p>
          <p className="text-muted-foreground text-sm mt-1">Welcome, {result.name}</p>
        </div>
        <div className="bg-oroko-black rounded-sm px-6 py-4 inline-block">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Registration Code</p>
          <p className="font-mono text-xl font-bold text-oroko-gold tracking-widest">{result.code}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          A confirmation will be sent to your email. Show this code at check-in.
        </p>
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <Ticket className="size-8 mx-auto mb-2 opacity-40" />
        No tickets currently available.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      {/* Ticket type selection */}
      <div className="space-y-2">
        <Label className="text-xs tracking-wider uppercase text-muted-foreground">Select Ticket</Label>
        {available.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedTicket(t)}
            className={cn(
              "w-full flex items-start justify-between gap-3 p-4 border rounded-sm text-left transition-colors",
              selectedTicket?.id === t.id
                ? "border-oroko-gold bg-oroko-gold/5"
                : "border-border hover:border-oroko-gold/40"
            )}
          >
            <div className="flex-1">
              <p className="font-medium text-oroko-black text-sm">{t.name}</p>
              {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
              {t.spotsLeft != null && t.spotsLeft < 10 && (
                <p className="text-xs text-red-500 mt-0.5">{t.spotsLeft} spots left</p>
              )}
            </div>
            <span className="font-semibold text-sm shrink-0">
              {t.isFree ? <span className="text-emerald-600">Free</span> : `${t.currency} ${t.price}`}
            </span>
          </button>
        ))}
      </div>

      {/* Quantity */}
      <div className="space-y-1.5">
        <Label htmlFor="quantity" className="text-xs tracking-wider uppercase text-muted-foreground">
          Number of tickets
        </Label>
        <Input
          id="quantity"
          type="number"
          min={1}
          max={10}
          {...register("quantity", { valueAsNumber: true })}
          className={cn(errors.quantity && "border-destructive")}
        />
        {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        <Label htmlFor="attendeeName" className="text-xs tracking-wider uppercase text-muted-foreground">Full Name</Label>
        <Input id="attendeeName" {...register("attendeeName")} placeholder="Your name" className={cn(errors.attendeeName && "border-destructive")} />
        {errors.attendeeName && <p className="text-xs text-destructive">{errors.attendeeName.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="attendeeEmail" className="text-xs tracking-wider uppercase text-muted-foreground">Email</Label>
        <Input id="attendeeEmail" type="email" {...register("attendeeEmail")} placeholder="your@email.com" className={cn(errors.attendeeEmail && "border-destructive")} />
        {errors.attendeeEmail && <p className="text-xs text-destructive">{errors.attendeeEmail.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-xs tracking-wider uppercase text-muted-foreground">Notes (optional)</Label>
        <Textarea id="notes" {...register("notes")} rows={2} placeholder="Dietary requirements, accessibility needs…" />
      </div>

      {/* Total */}
      {selectedTicket && !selectedTicket.isFree && (
        <div className="flex items-center justify-between py-3 border-t border-border text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold text-oroko-black">
            {selectedTicket.currency} {totalPrice.toLocaleString()}
          </span>
        </div>
      )}

      {selectedTicket && !selectedTicket.isFree && (
        <div className="space-y-2">
          <Label className="text-xs tracking-wider uppercase text-muted-foreground">Payment method</Label>
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
                    ? "border-oroko-gold bg-oroko-gold/10 text-oroko-black"
                    : "border-border text-muted-foreground hover:border-oroko-gold/40"
                )}
              >
                {provider === "paypal" ? "PayPal" : "Card (Stripe)"}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !selectedTicket}
        className="w-full flex items-center justify-center gap-2 py-3 bg-oroko-gold text-oroko-black text-sm font-bold tracking-wider uppercase hover:bg-oroko-gold-light disabled:opacity-50 transition-colors rounded-sm"
      >
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Ticket className="size-4" />}
        {isSubmitting ? "Registering…" : "Register Now"}
      </button>
    </form>
  );
}

function StripeTicketPayment({
  payment,
  onSuccess,
}: {
  payment: { clientSecret: string; registrationId: string; code: string; name: string };
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

    const result = await confirmEventPayment(payment.registrationId);
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
      <p className="text-sm text-muted-foreground">
        Completing ticket payment for {payment.name}.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full flex items-center justify-center gap-2 py-3 bg-oroko-gold text-oroko-black text-sm font-bold tracking-wider uppercase hover:bg-oroko-gold-light disabled:opacity-50 transition-colors rounded-sm"
      >
        {isProcessing && <Loader2 className="size-4 animate-spin" />}
        {isProcessing ? "Processing…" : "Pay and confirm ticket"}
      </button>
      <p className="text-xs text-center text-muted-foreground">
        🔒 Secured by Stripe. Card details are not stored by OROKO International.
      </p>
    </form>
  );
}
