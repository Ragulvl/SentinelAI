import mongoose, { Schema, Document } from 'mongoose';

export interface IIncident {
  startedAt: Date;
  resolvedAt: Date | null;
  duration: number | null; // seconds
  type: 'down' | 'degraded';
  error?: string;
}

export interface IMonitoredSite extends Document {
  userId: number;
  url: string;
  name: string;
  monitorType: 'http' | 'keyword' | 'port';
  keyword?: string;          // keyword to look for in response body
  keywordPresent?: boolean;  // true = must exist, false = must NOT exist
  expectedStatus: number;    // expected HTTP status code (default 200)
  port?: number;             // for port monitoring
  status: 'up' | 'down' | 'degraded';
  statusCode: number | null; // actual last HTTP status code
  responseTime: number;
  uptime: number;
  sslValid: boolean;
  sslExpiry: Date | null;
  sslDaysLeft: number | null;
  lastChecked: Date;
  responseHistory: number[];   // up to 90 data points
  statusHistory: ('up' | 'down' | 'degraded')[];
  incidents: IIncident[];      // last 50 incidents
  checkInterval: number;
  lastNotificationSent?: Date;
  lastNotificationType?: 'down' | 'degraded' | 'ssl_expiring' | 'recovered';
  notificationsSent: number;
  createdAt: Date;
  updatedAt: Date;
}

const IncidentSchema = new Schema<IIncident>(
  {
    startedAt:  { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    duration:   { type: Number, default: null },
    type:       { type: String, enum: ['down', 'degraded'], required: true },
    error:      { type: String },
  },
  { _id: false }
);

const MonitoredSiteSchema = new Schema<IMonitoredSite>(
  {
    userId: { type: Number, required: true, index: true },

    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v: string) => /^https?:\/\/.+/.test(v),
        message: 'URL must start with http:// or https://',
      },
    },

    name: { type: String, required: true, trim: true },

    monitorType: {
      type: String,
      enum: ['http', 'keyword', 'port'],
      default: 'http',
    },

    keyword:        { type: String, default: null },
    keywordPresent: { type: Boolean, default: true },
    expectedStatus: { type: Number, default: 200 },
    port:           { type: Number, default: null },

    status: {
      type: String,
      enum: ['up', 'down', 'degraded'],
      default: 'up',
    },

    statusCode:   { type: Number, default: null },
    responseTime: { type: Number, default: 0 },

    uptime: { type: Number, default: 100, min: 0, max: 100 },

    sslValid:    { type: Boolean, default: true },
    sslExpiry:   { type: Date,    default: null },
    sslDaysLeft: { type: Number,  default: null },

    lastChecked: { type: Date, default: Date.now },

    responseHistory: { type: [Number], default: [] }, // last 90 response times
    statusHistory:   { type: [String], default: [] }, // last 90 statuses

    incidents: { type: [IncidentSchema], default: [] },

    checkInterval: { type: Number, default: 60, min: 30, max: 3600 },

    lastNotificationSent: { type: Date, default: null },
    lastNotificationType: {
      type: String,
      enum: ['down', 'degraded', 'ssl_expiring', 'recovered'],
      default: null,
    },
    notificationsSent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MonitoredSiteSchema.index({ userId: 1, url: 1 }, { unique: true });
MonitoredSiteSchema.index({ userId: 1, createdAt: -1 });

export const MonitoredSite = mongoose.model<IMonitoredSite>('MonitoredSite', MonitoredSiteSchema);

