import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPayPalPlan extends Document {
  key: string;
  paypalId: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayPalPlanSchema = new Schema<IPayPalPlan>(
  {
    key: { type: String, required: true, unique: true },
    paypalId: { type: String, required: true },
  },
  { timestamps: true }
);

const PayPalPlan: Model<IPayPalPlan> =
  mongoose.models.PayPalPlan ??
  mongoose.model<IPayPalPlan>("PayPalPlan", PayPalPlanSchema);

export default PayPalPlan;
