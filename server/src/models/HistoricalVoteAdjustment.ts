import { Schema, model, Document, Types } from 'mongoose';

export const HISTORICAL_ADJUSTMENT_STATUS = {
  ACTIVE: 'active',
  REVERSED: 'reversed',
} as const;

export type HistoricalAdjustmentStatus =
  (typeof HISTORICAL_ADJUSTMENT_STATUS)[keyof typeof HISTORICAL_ADJUSTMENT_STATUS];

export interface HistoricalVoteAdjustmentDoc extends Document {
  _id: Types.ObjectId;
  electionId: Types.ObjectId;
  amount: number;
  reason: string;
  authorizedBy: string;
  metadata?: Record<string, unknown>;
  status: HistoricalAdjustmentStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const historicalVoteAdjustmentSchema = new Schema<HistoricalVoteAdjustmentDoc>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger, immutable: true },
    reason: { type: String, required: true, trim: true, maxlength: 2000, immutable: true },
    authorizedBy: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
    metadata: { type: Schema.Types.Mixed, immutable: true },
    status: {
      type: String,
      enum: Object.values(HISTORICAL_ADJUSTMENT_STATUS),
      default: HISTORICAL_ADJUSTMENT_STATUS.ACTIVE,
      index: true,
      immutable: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, immutable: true },
  },
  { timestamps: true },
);

// One active adjustment is the source of truth for an election. Corrections must be
// represented by a separately authorized reversal/adjustment, never by rewriting this record.
historicalVoteAdjustmentSchema.index(
  { electionId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: HISTORICAL_ADJUSTMENT_STATUS.ACTIVE } },
);

export const HistoricalVoteAdjustment = model<HistoricalVoteAdjustmentDoc>(
  'HistoricalVoteAdjustment',
  historicalVoteAdjustmentSchema,
);