"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Event from "@/models/Event";
import EventRegistration, { type IEventRegistration } from "@/models/EventRegistration";
import { z } from "zod";
import { Types } from "mongoose";
import type { ActionResult } from "@/types";
import { stripe, formatAmountForStripe } from "@/lib/stripe";
import { createPayPalOrder } from "@/lib/payments/paypal";
import {
  getPaymentCancelUrl,
  getPaymentReturnUrl,
} from "@/lib/payments/origin";
import { fulfillStripePaymentIntent } from "@/lib/payments/fulfillment";

const registrationSchema = z.object({
  eventId: z.string().min(1),
  ticketTypeId: z.string().min(1),
  attendeeName: z.string().min(2, "Name is required").max(100),
  attendeeEmail: z.string().email("Valid email required"),
  quantity: z.number().int().min(1).max(10),
  notes: z.string().max(300).optional(),
  paymentProvider: z.enum(["stripe", "paypal"]).default("stripe"),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export async function registerForEvent(
  data: unknown
): Promise<ActionResult & {
  registrationId?: string;
  registrationCode?: string;
  clientSecret?: string;
  approvalUrl?: string;
}> {
  const parsed = registrationSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid data" };
  }

  const { eventId, ticketTypeId, attendeeName, attendeeEmail, quantity, notes, paymentProvider } = parsed.data;

  try {
    const session = await auth();
    await connectDB();

    if (!Types.ObjectId.isValid(eventId) || !Types.ObjectId.isValid(ticketTypeId)) {
      return { success: false, error: "Invalid event or ticket." };
    }
    const event = await Event.findById(new Types.ObjectId(eventId));
    if (!event) return { success: false, error: "Event not found" };
    if (event.status !== "published") return { success: false, error: "Registrations are closed" };

    const now = new Date();
    if (event.registrationDeadline && now > event.registrationDeadline) {
      return { success: false, error: "Registration deadline has passed" };
    }

    const ticket = event.ticketTypes.find(
      (t) => (t as { _id?: Types.ObjectId })?._id?.toString() === ticketTypeId
    );
    if (!ticket || !ticket.isActive) return { success: false, error: "Ticket type not available" };
    if (ticket.isMembersOnly && session?.user?.membershipStatus !== "active") {
      return { success: false, error: "This ticket is available to active members only." };
    }

    // One registration per email per event
    const existing = await EventRegistration.findOne({
      event: new Types.ObjectId(eventId),
      attendeeEmail,
      status: { $in: ["confirmed", "pending"] },
    });
    if (existing) return { success: false, error: "You are already registered for this event" };

    const totalAmount = Number((ticket.price * quantity).toFixed(2));
    const eventIdObject = new Types.ObjectId(eventId);
    const ticketIdObject = new Types.ObjectId(ticketTypeId);
    const capacityFilter: Record<string, unknown> = {
      _id: eventIdObject,
      status: "published",
      ticketTypes: {
        $elemMatch: {
          _id: ticketIdObject,
          isActive: true,
          ...(ticket.capacity != null
            ? { sold: { $lte: ticket.capacity - quantity } }
            : {}),
        },
      },
    };
    if (event.capacity != null) {
      capacityFilter.attendeeCount = { $lte: event.capacity - quantity };
    }
    const reserved = await Event.findOneAndUpdate(
      capacityFilter,
      {
        $inc: {
          attendeeCount: quantity,
          "ticketTypes.$[ticket].sold": quantity,
        },
      },
      {
        new: true,
        arrayFilters: [{ "ticket._id": ticketIdObject, "ticket.isActive": true }],
      }
    );
    if (!reserved) {
      return { success: false, error: "Not enough tickets or event capacity remains." };
    }

    let reg: IEventRegistration;
    try {
      reg = await EventRegistration.create({
        event: eventIdObject,
        user: session?.user?.id ? new Types.ObjectId(session.user.id) : undefined,
        attendeeName,
        attendeeEmail,
        ticketTypeId,
        ticketTypeName: ticket.name,
        ticketPrice: ticket.price,
        currency: ticket.currency,
        quantity,
        totalAmount,
        status: ticket.isFree ? "confirmed" : "pending",
        paymentProvider: ticket.isFree ? undefined : paymentProvider,
        notes,
      });
    } catch (error) {
      await Event.findByIdAndUpdate(eventIdObject, {
        $inc: { attendeeCount: -quantity, "ticketTypes.$[ticket].sold": -quantity },
      }, { arrayFilters: [{ "ticket._id": ticketIdObject }] });
      throw error;
    }

    if (!ticket.isFree) {
      try {
        if (paymentProvider === "stripe") {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: formatAmountForStripe(totalAmount, ticket.currency),
            currency: ticket.currency.toLowerCase(),
            receipt_email: attendeeEmail,
            metadata: {
              paymentType: "event",
              registrationId: reg._id.toString(),
            },
          });
          if (!paymentIntent.client_secret) {
            throw new Error("Stripe did not return a payment client secret.");
          }
          reg.stripePaymentIntentId = paymentIntent.id;
          await reg.save();
          revalidatePath(`/events/${event.slug}`);
          revalidatePath("/portal/events");
          return {
            success: true,
            registrationId: reg._id.toString(),
            registrationCode: reg.registrationCode,
            clientSecret: paymentIntent.client_secret,
          };
        }

        const order = await createPayPalOrder({
          amount: totalAmount,
          currency: ticket.currency,
          description: `${event.title} — ${ticket.name}`,
          customId: reg._id.toString(),
          returnUrl: getPaymentReturnUrl("paypal", "event"),
          cancelUrl: getPaymentCancelUrl("event"),
        });
        reg.paypalOrderId = order.orderId;
        reg.paypalOrderIds.push(order.orderId);
        await reg.save();
        revalidatePath(`/events/${event.slug}`);
        revalidatePath("/portal/events");
        return {
          success: true,
          registrationId: reg._id.toString(),
          registrationCode: reg.registrationCode,
          approvalUrl: order.approvalUrl,
        };
      } catch (error) {
        const cancelled = await EventRegistration.findOneAndUpdate(
          { _id: reg._id, status: "pending" },
          { $set: { status: "cancelled" } },
          { new: false }
        );
        if (cancelled) {
          await Event.findByIdAndUpdate(eventIdObject, {
            $inc: {
              attendeeCount: -quantity,
              "ticketTypes.$[ticket].sold": -quantity,
            },
          }, { arrayFilters: [{ "ticket._id": ticketIdObject }] });
        }
        throw error;
      }
    }

    revalidatePath(`/events/${event.slug}`);
    revalidatePath("/portal/events");

    return {
      success: true,
      registrationId: reg._id.toString(),
      registrationCode: reg.registrationCode,
    };
  } catch (err) {
    console.error("[registerForEvent]", err);
    return { success: false, error: err instanceof Error ? err.message : "Registration failed" };
  }
}

export async function cancelRegistration(registrationId: string): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Unauthorized" };

    await connectDB();
    if (!Types.ObjectId.isValid(registrationId)) {
      return { success: false, error: "Invalid registration." };
    }
    const reg = await EventRegistration.findOne({
      _id: new Types.ObjectId(registrationId),
      user: new Types.ObjectId(session.user.id),
      status: "confirmed",
    });
    if (!reg) return { success: false, error: "Registration not found" };

    const cancelled = await EventRegistration.findOneAndUpdate(
      { _id: reg._id, status: "confirmed" },
      { $set: { status: "cancelled" } },
      { new: false }
    );
    if (!cancelled) return { success: false, error: "Registration has already changed." };

    await Event.findByIdAndUpdate(reg.event, {
      $inc: {
        attendeeCount: -reg.quantity,
        "ticketTypes.$[ticket].sold": -reg.quantity,
      },
    }, { arrayFilters: [{ "ticket._id": new Types.ObjectId(reg.ticketTypeId) }] });

    revalidatePath("/portal/events");
    return { success: true };
  } catch (err) {
    console.error("[cancelRegistration]", err);
    return { success: false, error: "Failed to cancel" };
  }
}

export async function confirmEventPayment(registrationId: string): Promise<ActionResult> {
  try {
    if (!Types.ObjectId.isValid(registrationId)) {
      return { success: false, error: "Invalid registration." };
    }
    await connectDB();
    const registration = await EventRegistration.findById(registrationId)
      .select("+stripePaymentIntentId");
    if (!registration?.stripePaymentIntentId) {
      return { success: false, error: "Stripe ticket payment not found." };
    }
    const paymentIntent = await stripe.paymentIntents.retrieve(registration.stripePaymentIntentId);
    await fulfillStripePaymentIntent(paymentIntent);
    revalidatePath("/portal/events");
    return { success: true };
  } catch (err) {
    console.error("[confirmEventPayment]", err);
    return { success: false, error: "Failed to confirm ticket payment." };
  }
}

/** Void-returning wrapper for use as a Next.js form action via .bind() */
export async function cancelRegistrationVoid(registrationId: string): Promise<void> {
  await cancelRegistration(registrationId);
}
