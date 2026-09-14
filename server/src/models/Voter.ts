import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { normalizeEmail } from '../utils/regNumber';

export type VoterStatus = 'PENDING' | 'VERIFIED' | 'REVOKED';

export interface VoterDoc extends Document {
  _id: Types.ObjectId;
  electionId?: Types.ObjectId; // election this voter is accredited for
  name?: string;
  fullName: string;
  email: string;
  normalizedEmail: string; // trimmed and lowercased
  rosterSerialNumber?: string; // official roster serial number if provided
  serialNumber?: string; // alias for rosterSerialNumber
  registrationNumber?: string; // optional alias for registration number
  programme?: string; // programme of study (internal administrative use)
  faculty?: string; // faculty / college (internal administrative use)
  gender?: string; // gender on roster

  // Status lifecycle: PENDING, VERIFIED, REVOKED
  status: VoterStatus;
  verifiedAt?: Date;
  verificationRevokedAt?: Date;
  verificationAttempts: number;

  // Account / authentication fields
  password?: string;
  isVerified: boolean;
  isEligible: boolean; // committee toggle for voter eligibility
  hasRegistered: boolean; // true once member completes email verification or password

  // Registration email verification
  verificationTokenHash?: string;
  verificationTokenExpires?: Date;
  verificationTokenExpiresAt?: Date;
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
    electionId: { type: Schema.Types.ObjectId, ref: 'Election', index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 160 },
    name: { type: String, trim: true, maxlength: 160 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    rosterSerialNumber: { type: String, trim: true },
    serialNumber: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    programme: { type: String, trim: true },
    faculty: { type: String, trim: true },
    gender: { type: String, trim: true },

    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REVOKED'],
      default: 'PENDING',
      index: true,
    },
    verifiedAt: { type: Date },
    verificationRevokedAt: { type: Date },
    verificationAttempts: { type: Number, default: 0 },

    password: { type: String, select: false },
    isVerified: { type: Boolean, default: false },
    isEligible: { type: Boolean, default: true },
    hasRegistered: { type: Boolean, default: false },

    // Registration verification token
    verificationTokenHash: { type: String, select: false, index: true },
    verificationTokenExpires: { type: Date, select: false },
    verificationTokenExpiresAt: { type: Date, select: false },
    verificationTokenSentAt: { type: Date, select: false },

    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },

    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportHistory' },
  },
  { timestamps: true },
);

// Compound uniqueness: UNIQUE(election_id, normalized_email)
voterSchema.index(
  { electionId: 1, normalizedEmail: 1 },
  { unique: true, partialFilterExpression: { electionId: { $exists: true } } },
);

// Fallback uniqueness for legacy/unscoped records
voterSchema.index(
  { normalizedEmail: 1 },
  { unique: true, partialFilterExpression: { electionId: { $exists: false } } },
);

// Additional operational indexes
voterSchema.index({ electionId: 1, status: 1 });
voterSchema.index({ electionId: 1, rosterSerialNumber: 1 });
voterSchema.index({ isEligible: 1 });

voterSchema.pre('validate', function preValidate(next) {
  if (this.email) {
    this.normalizedEmail = normalizeEmail(this.email);
  }
  if (this.serialNumber && !this.rosterSerialNumber) {
    this.rosterSerialNumber = this.serialNumber;
  }
  if (this.rosterSerialNumber && !this.serialNumber) {
    this.serialNumber = this.rosterSerialNumber;
  }
  if (this.fullName && !this.name) {
    this.name = this.fullName;
  }
  if (this.name && !this.fullName) {
    this.fullName = this.name;
  }
  if (this.verificationTokenExpires && !this.verificationTokenExpiresAt) {
    this.verificationTokenExpiresAt = this.verificationTokenExpires;
  }
  if (this.verificationTokenExpiresAt && !this.verificationTokenExpires) {
    this.verificationTokenExpires = this.verificationTokenExpiresAt;
  }
  // Sync boolean flags with status
  if (this.status === 'VERIFIED') {
    this.isVerified = true;
  } else if (this.status === 'REVOKED') {
    this.isEligible = false;
  } else if (this.status === 'PENDING') {
    this.isVerified = false;
  }
  next();
});

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
    delete ret.verificationTokenHash;
    delete ret.verificationTokenExpires;
    delete ret.verificationTokenExpiresAt;
    return ret;
  },
});

export const Voter = model<VoterDoc>('Voter', voterSchema);
