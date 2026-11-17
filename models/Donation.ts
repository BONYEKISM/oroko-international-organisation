import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type DonationType = "general" | "project";
export type DonationStatus =
  | "pending"
  | "succeeded"
  | "active"
  | "cancelled"
  | "failed"
  | "refunded";
export type DonationFrequency = "once" | "monthly" | "annually";

export interface IDonation extends Document {
  // Donor — anonymous allowed
  donorName: string;
  donorEmail: string;
  userId?: Types.ObjectId;
  // Amount
  amount: number;
  currency: string;
  // Attribution
  type: DonationType;
  project?: Types.ObjectId;
  message?: string;
  isAnonymous: boolean;
  frequency: DonationFrequency;
  paymentProvider: "stripe" | "paypal";
  // Payment — no payment details stored here, only provider references
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  paypalOrderId?: string;
  paypalOrderIds: string[];
  paypalSubscriptionId?: string;
  paypalPlanId?: string;
  subscriptionPaymentIds: string[];
  status: DonationStatus;
  // Receipt
  receiptNumber?: string;
  receiptSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DonationSchema = new Schema<IDonation>(
  {
    donorName: { type: String, required: true, trim: true },
    donorEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Valid email required"],
    },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "USD" },
    type: { type: String, enum: ["general", "project"], default: "general" },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    message: { type: String, trim: true, maxlength: 500 },
    isAnonymous: { type: Boolean, default: false },
    frequency: { type: String, enum: ["once", "monthly", "annually"], default: "once" },
    paymentProvider: { type: String, enum: ["stripe", "paypal"], default: "stripe" },
    stripePaymentIntentId: { type: String, select: false },
    stripeCustomerId: { type: String, select: false },
    stripeSubscriptionId: { type: String, select: false },
    paypalOrderId: { type: String, select: false },
    paypalOrderIds: { type: [String], default: [], select: false },
    paypalSubscriptionId: { type: String, select: false },
    paypalPlanId: { type: String, select: false },
    subscriptionPaymentIds: { type: [String], default: [], select: false },
    status: {
      type: String,
      enum: ["pending", "succeeded", "active", "cancelled", "failed", "refunded"],
      default: "pending",
    },
    receiptNumber: { type: String },
    receiptSentAt: { type: Date },
  },
  { timestamps: true }
);

DonationSchema.index({ donorEmail: 1 });
DonationSchema.index({ userId: 1 });
DonationSchema.index({ project: 1 });
DonationSchema.index({ status: 1 });
DonationSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });
DonationSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
DonationSchema.index({ paypalOrderId: 1 }, { sparse: true });
DonationSchema.index({ paypalSubscriptionId: 1 }, { sparse: true });

const Donation: Model<IDonation> =
  mongoose.models.Donation ??
  mongoose.model<IDonation>("Donation", DonationSchema);

export default Donation;
