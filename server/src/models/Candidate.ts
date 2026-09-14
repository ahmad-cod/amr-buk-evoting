import { Schema, model, Document, Types } from 'mongoose';
import { CANDIDATE_STATUS, CandidateStatus } from '../config/constants';

export interface CandidateDoc extends Document {
  _id: Types.ObjectId;
  electionId: Types.ObjectId;
  positionId: Types.ObjectId;
  fullName: string;
  faculty?: string;
  department?: string;
  programme?: string;
  level?: string;
  bio?: string;
  manifesto?: string;
  campaignSlogan?: string;
  imageUrl?: string;
  s3Key?: string;
  status: CandidateStatus;
  displayOrder: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const candidateSchema = new Schema<CandidateDoc>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    positionId: { type: Schema.Types.ObjectId, ref: 'Position', required: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 160 },
    faculty: { type: String, trim: true },
    department: { type: String, trim: true },
    programme: { type: String, trim: true },
    level: { type: String, trim: true },
    bio: { type: String, trim: true },
    manifesto: { type: String, trim: true },
    campaignSlogan: { type: String, trim: true, maxlength: 200 },
    imageUrl: { type: String },
    s3Key: { type: String },
    status: {
      type: String,
      enum: Object.values(CANDIDATE_STATUS),
      default: CANDIDATE_STATUS.PENDING,
      index: true,
    },
    displayOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

// A candidate can only run once per position within an election.
candidateSchema.index(
  { electionId: 1, positionId: 1, fullName: 1 },
  { unique: true },
);

export const Candidate = model<CandidateDoc>('Candidate', candidateSchema);

// Ensure legacy registration number index is safely dropped in existing collections
Candidate.collection.dropIndex('electionId_1_positionId_1_registrationNumber_1').catch(() => {
  // Ignore error if index does not exist
});
