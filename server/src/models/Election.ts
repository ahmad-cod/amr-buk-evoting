import { Schema, model, Document, Types } from 'mongoose';
import { ELECTION_STATUS, ElectionStatus } from '../config/constants';

export interface ElectionDoc extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  bannerImage?: string;
  bannerStorageKey?: string;
  startDateTime: Date;
  endDateTime: Date;
  status: ElectionStatus;

  liveResultsEnabled: boolean;
  finalResultsPublished: boolean;
  registrationEnabled: boolean;
  votingEnabled: boolean;
  requireCandidateApproval: boolean;

  instructions?: string;
  eligibleDepartments: string[]; // empty = all faculty departments

  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const electionSchema = new Schema<ElectionDoc>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true },
    bannerImage: { type: String },
    bannerStorageKey: { type: String },
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(ELECTION_STATUS),
      default: ELECTION_STATUS.DRAFT,
      index: true,
    },

    liveResultsEnabled: { type: Boolean, default: false },
    finalResultsPublished: { type: Boolean, default: false },
    registrationEnabled: { type: Boolean, default: true },
    votingEnabled: { type: Boolean, default: true },
    requireCandidateApproval: { type: Boolean, default: true },

    instructions: { type: String },
    eligibleDepartments: { type: [String], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true },
);

electionSchema.pre('validate', function validateDates(next) {
  if (this.startDateTime && this.endDateTime && this.endDateTime <= this.startDateTime) {
    this.invalidate('endDateTime', 'End date/time must be after start date/time');
  }
  next();
});

export const Election = model<ElectionDoc>('Election', electionSchema);
