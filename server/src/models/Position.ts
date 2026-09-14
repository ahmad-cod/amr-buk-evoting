import { Schema, model, Document, Types } from 'mongoose';

export interface PositionDoc extends Document {
  _id: Types.ObjectId;
  electionId: Types.ObjectId;
  title: string;
  description?: string;
  displayOrder: number;
  maxCandidates: number;
  maxVotesPerVoter: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const positionSchema = new Schema<PositionDoc>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true },
    displayOrder: { type: Number, default: 0 },
    maxCandidates: { type: Number, default: 10, min: 1 },
    maxVotesPerVoter: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// A position title is unique within an election.
positionSchema.index({ electionId: 1, title: 1 }, { unique: true });

export const Position = model<PositionDoc>('Position', positionSchema);
