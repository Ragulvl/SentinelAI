import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  githubId: number;
  username: string;
  email: string;
  name: string;
  avatarUrl: string;
  bio?: string;
  company?: string;
  location?: string;
  githubAccessToken?: string;
  role: 'user' | 'admin' | 'superadmin';
  isBanned: boolean;
  bannedAt?: Date;
  bannedReason?: string;
  firstLogin: Date;
  lastLogin: Date;
  lastActive: Date;
  loginCount: number;
  extra?: Record<string, any>;
  pushSubscription?: any;
  notificationsEnabled?: boolean;
  whatsappNumber?: string;
  whatsappNotificationsEnabled?: boolean;
  telegramChatId?: string;
  telegramNotificationsEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    githubId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    avatarUrl: {
      type: String,
      required: true,
    },
    bio: {
      type: String,
      default: null,
    },
    company: {
      type: String,
      default: null,
    },
    location: {
      type: String,
      default: null,
    },
    githubAccessToken: {
      type: String,
      default: null,
      select: false, // Don't include in queries by default for security
    },
    firstLogin: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastLogin: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastActive: {
      type: Date,
      required: true,
      default: Date.now,
    },
    loginCount: {
      type: Number,
      default: 1,
    },
    extra: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Push notification settings
    pushSubscription: {
      type: Schema.Types.Mixed,
      default: null,
    },
    notificationsEnabled: {
      type: Boolean,
      default: false,
    },
    // WhatsApp (legacy — kept for existing users, will be cleaned up later)
    whatsappNumber: { type: String, default: null },
    whatsappNotificationsEnabled: { type: Boolean, default: false },
    // Telegram notification settings
    telegramChatId: {
      type: String,
      default: null,
    },
    telegramNotificationsEnabled: {
      type: Boolean,
      default: false,
    },
    // Role-based access control
    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      default: 'user',
      index: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    bannedAt: { type: Date, default: null },
    bannedReason: { type: String, default: null },

  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
UserSchema.index({ lastActive: -1 });
UserSchema.index({ lastLogin: -1 });

export const User = mongoose.model<IUser>('User', UserSchema);
