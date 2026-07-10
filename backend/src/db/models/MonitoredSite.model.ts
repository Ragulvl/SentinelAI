import mongoose, { Schema, Document } from 'mongoose';

export interface IMonitoredSite extends Document {
  userId: number;
  url: string;
  name: string;
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
  uptime: number;
  sslValid: boolean;
  sslExpiry: Date | null;
  lastChecked: Date;
  responseHistory: number[];
  statusHistory: ('up' | 'down' | 'degraded')[];
  checkInterval: number; // in seconds
  lastNotificationSent?: Date;
  lastNotificationType?: 'down' | 'degraded' | 'ssl_expiring' | 'recovered';
  notificationsSent: number;
  createdAt: Date;
  updatedAt: Date;
}

const MonitoredSiteSchema = new Schema<IMonitoredSite>(
  {
    userId: {
      type: Number,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['up', 'down', 'degraded'],
      default: 'up',
    },
    responseTime: {
      type: Number,
      default: 0,
    },
    uptime: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    sslValid: {
      type: Boolean,
      default: true,
    },
    sslExpiry: {
      type: Date,
      default: null,
    },
    lastChecked: {
      type: Date,
      default: Date.now,
    },
    responseHistory: {
      type: [Number],
      default: [],
    },
    statusHistory: {
      type: [String],
      default: [],
    },
    checkInterval: {
      type: Number,
      default: 60, // Default 60 seconds
      min: 30, // Minimum 30 seconds
      max: 3600, // Maximum 1 hour
    },
    lastNotificationSent: {
      type: Date,
      default: null,
    },
    lastNotificationType: {
      type: String,
      enum: ['down', 'degraded', 'ssl_expiring', 'recovered'],
      default: null,
    },
    notificationsSent: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

MonitoredSiteSchema.index({ userId: 1, url: 1 }, { unique: true });

export const MonitoredSite = mongoose.model<IMonitoredSite>('MonitoredSite', MonitoredSiteSchema);
