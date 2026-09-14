import { Schema, model, Document, Types } from 'mongoose';

export interface ImportRowError {
  row: number;
  identifier?: string;
  registrationNumber?: string;
  reason: string;
}

export interface ImportHistoryDoc extends Omit<Document, 'errors'> {
  _id: Types.ObjectId;
  fileName?: string;
  importedBy: Types.ObjectId;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: ImportRowError[];
  activateImmediately: boolean;
  createdAt: Date;
}

const importHistorySchema = new Schema<ImportHistoryDoc>(
  {
    fileName: { type: String },
    importedBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    totalRows: { type: Number, default: 0 },
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
            registrationNumber: String,
            reason: String,
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
