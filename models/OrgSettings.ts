import mongoose, { Schema, Document, Model } from "mongoose";

/** Singleton document — there is always exactly one settings record. */
export interface IOrgSettings extends Document {
  organizationName: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  executiveCouncilPresidentMessage?: string;
  notifyOnNewApplication: boolean;
  notifyOnNewDonation: boolean;
  notifyOnWelfareRequest: boolean;
  memberIdPrefix: string;
  membershipDuesAmount: number;
  membershipDuesCurrency: "EUR" | "USD" | "GBP" | "CAD" | "AUD";
  paypalDonationProductId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrgSettingsSchema = new Schema<IOrgSettings>(
  {
    organizationName: { type: String, required: true, trim: true, default: "OROKO International" },
    contactEmail: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    address: { type: String, trim: true },
    executiveCouncilPresidentMessage: { type: String, trim: true, maxlength: 1000 },
    notifyOnNewApplication: { type: Boolean, default: true },
    notifyOnNewDonation: { type: Boolean, default: true },
    notifyOnWelfareRequest: { type: Boolean, default: true },
    memberIdPrefix: { type: String, trim: true, default: "OROKO" },
    membershipDuesAmount: { type: Number, min: 0, default: 50 },
    membershipDuesCurrency: { type: String, uppercase: true, trim: true, default: "EUR" },
    paypalDonationProductId: { type: String, select: false },
  },
  { timestamps: true }
);

const OrgSettings: Model<IOrgSettings> =
  mongoose.models.OrgSettings ?? mongoose.model<IOrgSettings>("OrgSettings", OrgSettingsSchema);

export default OrgSettings;
