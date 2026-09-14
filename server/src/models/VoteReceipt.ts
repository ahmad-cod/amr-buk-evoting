import { Schema, model, Document, Types } from 'mongoose';

/**
 * A VoteReceipt records THAT a verified voter voted in an election — never WHOM they chose.
 * The unique index on (electionId, studentId) is the primary defense against
 * double voting. Selections live in the separate, identity-free Ballot collection.
 */
export interface VoteReceiptDoc extends Document {
  _id: Types.ObjectId;
  electionId: Types.ObjectId;
  studentId: Types.ObjectId; // References the Voter record
  receiptCode: string;
  idempotencyKey?: string;
  ipHash?: string;
  userAgent?: string;
  submittedAt: Date;
}

const voteReceiptSchema = new Schema<VoteReceiptDoc>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: 'Election', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Voter', required: true },
    receiptCode: { type: String, required: true, unique: true },
    idempotencyKey: { type: String },
    ipHash: { type: String }, // hashed, not raw IP — for abuse monitoring only
    userAgent: { type: String },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// ONE vote per student per election — enforced at the database level.
voteReceiptSchema.index({ electionId: 1, studentId: 1 }, { unique: true });
// Idempotency: a repeated submission with the same key is a no-op, not a double vote.
voteReceiptSchema.index(
  { electionId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

export const VoteReceipt = model<VoteReceiptDoc>('VoteReceipt', voteReceiptSchema);
