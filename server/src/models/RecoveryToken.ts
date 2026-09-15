import { Schema, model, Document, Types } from 'mongoose';

export interface RecoveryTokenDoc extends Document {
  _id: Types.ObjectId;
  voterId?: Types.ObjectId;
  adminId?: Types.ObjectId;
  tokenHash: string; // SHA-256 hash of the 256-bit crypto-random token
  expiresAt: Date;   // 30-minute expiry
  usedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const recoveryTokenSchema = new Schema<RecoveryTokenDoc>(
  {
    voterId: { type: Schema.Types.ObjectId, ref: 'Voter', index: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

// TTL index to automatically purge expired tokens from MongoDB after 24 hours
recoveryTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export const RecoveryToken = model<RecoveryTokenDoc>('RecoveryToken', recoveryTokenSchema);
