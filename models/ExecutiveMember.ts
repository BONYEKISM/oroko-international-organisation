import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IExecutiveMember extends Document {
  user: Types.ObjectId;
  role: Types.ObjectId;
  term?: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  bio?: string;
  photoUrl?: string;
  countryCode?: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExecutiveMemberSchema = new Schema<IExecutiveMember>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: Schema.Types.ObjectId, ref: "GovernanceRole", required: true },
    term: { type: String, trim: true, maxlength: 100 },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
    bio: { type: String, trim: true, maxlength: 2000 },
    photoUrl: { type: String, trim: true, maxlength: 500 },
    countryCode: { type: String, trim: true, uppercase: true, minlength: 2, maxlength: 2 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ExecutiveMemberSchema.index({ isActive: 1 });
ExecutiveMemberSchema.index({ user: 1 });

const ExecutiveMember: Model<IExecutiveMember> =
  mongoose.models.ExecutiveMember ??
  mongoose.model<IExecutiveMember>("ExecutiveMember", ExecutiveMemberSchema);

export default ExecutiveMember;
