import { Schema, model, Document, Types } from 'mongoose';

export interface AuditLogDoc extends Document {
  _id: Types.ObjectId;
  adminId?: Types.ObjectId;
  actorLabel?: string; // human-readable actor (username) for quick display
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', index: true },
    actorLabel: { type: String },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

export const AuditLog = model<AuditLogDoc>('AuditLog', auditLogSchema);
