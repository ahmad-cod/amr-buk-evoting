import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface VoterDoc extends Document {
  _id: Types.ObjectId;
  fullName: string;
  email: string; // normalized, unique identifier for AMR voter auth
  serialNumber?: string; // official roster serial number if provided
  registrationNumber?: string; // optional alias for registration number
  programme?: string; // programme of study
  faculty?: string; // faculty / college
  gender?: string; // gender on roster

  // Account / authentication fields
  password?: string;
  isVerified: boolean;
  isEligible: boolean; // committee toggle for voter eligibility
  hasRegistered: boolean; // true once member sets account password

  // Registration email verification
  verificationTokenHash?: string;
  verificationTokenExpires?: Date;
  verificationTokenSentAt?: Date;

  // Password reset
  resetTokenHash?: string;
  resetTokenExpires?: Date;

  importBatchId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const voterSchema = new Schema<VoterDoc>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 160 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    serialNumber: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    programme: { type: String, trim: true },
    faculty: { type: String, trim: true },
    gender: { type: String, trim: true },

    password: { type: String, select: false },
    isVerified: { type: Boolean, default: true },
    isEligible: { type: Boolean, default: true },
    hasRegistered: { type: Boolean, default: false },

    // Registration verification token
    verificationTokenHash: { type: String, select: false },
    verificationTokenExpires: { type: Date, select: false },
    verificationTokenSentAt: { type: Date, select: false },

    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },

    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportHistory' },
  },
  { timestamps: true },
);

// Indexes
voterSchema.index({ isEligible: 1 });
voterSchema.index({ verificationTokenHash: 1 });

voterSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

voterSchema.methods.comparePassword = function compare(candidate: string) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

voterSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    return ret;
  },
});

export const Voter = model<VoterDoc>('Voter', voterSchema);
