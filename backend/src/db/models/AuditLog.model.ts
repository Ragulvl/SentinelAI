import mongoose, { Schema, Document } from 'mongoose';

export type AuditAction =
  | 'user.view'
  | 'user.ban'
  | 'user.unban'
  | 'user.delete'
  | 'user.role_change'
  | 'repo.list'
  | 'repo.download'
  | 'scan.view'
  | 'scan.delete'
  | 'pentest.view'
  | 'pentest.delete'
  | 'audit.view'
  | 'analytics.view';

export interface IAuditLog extends Document {
  adminId: string;
  adminUsername: string;
  action: AuditAction;
  targetId?: string;
  targetType?: 'user' | 'scan' | 'pentest' | 'repo';
  metadata?: Record<string, any>;
  ip?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    adminId:       { type: String, required: true, index: true },
    adminUsername: { type: String, required: true },
    action:        { type: String, required: true, index: true },
    targetId:      { type: String },
    targetType:    { type: String, enum: ['user', 'scan', 'pentest', 'repo'] },
    metadata:      { type: Schema.Types.Mixed },
    ip:            { type: String },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
// TTL: auto-delete logs after 90 days (compliance: keep ≥30 days per GDPR baseline)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
