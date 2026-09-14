import { Schema, model, Document, Types } from 'mongoose';

export interface ImportRowError {
  row: number;
  identifier?: string;
  serialNumber?: string;
  registrationNumber?: string;
  reason: string;
}

export interface ImportConflict {
  type: string;
  email?: string;
  serialNumber?: string;
  records: Array<{ row: number; serialNumber?: string; fullName?: string; email?: string }>;
  actionRequired: string;
}

export interface ImportHistoryDoc extends Omit<Document, 'errors'> {
  _id: Types.ObjectId;
  electionId?: Types.ObjectId;
  fileName?: string;
  importedBy: Types.ObjectId;
  totalRows: number;
  populatedRows: number;
  blankRows: number;
  validEmails: number;
  invalidEmails: number;
  duplicateEmails: number;
  duplicateSerials: number;
  importable: number;
  requiringReview: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: ImportRowError[];
  conflicts: ImportConflict[];
  activateImmediately: boolean;
  createdAt: Date;
}

const importHistorySchema = new Schema<ImportHistoryDoc>(
  {
    electionId: { type: Schema.Types.ObjectId, ref: 'Election', index: true },
    fileName: { type: String },
    importedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    totalRows: { type: Number, default: 0 },
    populatedRows: { type: Number, default: 0 },
    blankRows: { type: Number, default: 0 },
    validEmails: { type: Number, default: 0 },
    invalidEmails: { type: Number, default: 0 },
    duplicateEmails: { type: Number, default: 0 },
    duplicateSerials: { type: Number, default: 0 },
    importable: { type: Number, default: 0 },
    requiringReview: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    invalid: { type: Number, default: 0 },
    errors: {
      type: [
        new Schema<ImportRowError>(
          {
            row: Number,
            identifier: String,
            serialNumber: String,
            registrationNumber: String,
            reason: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    conflicts: {
      type: [
        new Schema<ImportConflict>(
          {
            type: String,
            email: String,
            serialNumber: String,
            records: [
              {
                row: Number,
                serialNumber: String,
                fullName: String,
                email: String,
              },
            ],
            actionRequired: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    activateImmediately: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const ImportHistory = model<ImportHistoryDoc>('ImportHistory', importHistorySchema);
