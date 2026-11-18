import { NextResponse } from "next/server";
import { z } from "zod";
import {
  completePayPalOrder,
  completePayPalSubscription,
  completeStripeSubscription,
} from "@/lib/payments/return";

const returnSchema = z.object({
  provider: z.enum(["paypal", "stripe"]),
  token: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const browserOrigin = request.headers.get("origin");
  if (!browserOrigin || browserOrigin !== requestOrigin) {
    return NextResponse.json({ error: "Invalid payment return origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payment return request." }, { status: 400 });
  }
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment return parameters." }, { status: 400 });
  }

  try {
    let result: { nextUrl: string };
    if (parsed.data.provider === "stripe") {
      if (!parsed.data.sessionId) {
        return NextResponse.json({ error: "Stripe checkout session is missing." }, { status: 400 });
      }
      result = await completeStripeSubscription(parsed.data.sessionId);
    } else if (parsed.data.subscriptionId) {
      result = await completePayPalSubscription(parsed.data.subscriptionId);
    } else if (parsed.data.token) {
      result = await completePayPalOrder(parsed.data.token);
    } else {
      return NextResponse.json({ error: "PayPal payment reference is missing." }, { status: 400 });
    }

    return NextResponse.json({ success: true, nextUrl: result.nextUrl });
  } catch (error) {
    console.error("[payment return] Provider confirmation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify payment." },
      { status: 400 }
    );
  }
}
