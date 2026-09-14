import { Schema, model, Document, Types } from 'mongoose';

/**
 * A Ballot is a single anonymous selection: "in this election, for this position,
 * one vote went to this candidate." It deliberately contains NO studentId and no
 * link back to a VoteReceipt, so tallies can never be traced to a voter.
 *
 * One submitted vote produces one Ballot per selected candidate.
 */
export interface BallotDoc extends Document {
  _id: Types.ObjectId;
  electionId: Types.ObjectId;
  positionId: Types.ObjectId;
  candidateId: Types.ObjectId;
  createdAt: Date;
}

const ballotSchema = new Schema<BallotDoc>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    positionId: { type: Schema.Types.ObjectId, ref: 'Position', required: true, index: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Fast aggregation for tallies.
ballotSchema.index({ electionId: 1, positionId: 1, candidateId: 1 });

export const Ballot = model<BallotDoc>('Ballot', ballotSchema);
