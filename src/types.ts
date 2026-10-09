export interface Filter {
  id: string;
  keyword: string;
  location: string;
  type: string;
  timeWindow: string;
  active: boolean;
}

export type JobSource = 'linkedin' | 'gupy' | 'indeed' | string;

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  city?: string;
  modality?: string;
  type: string;
  publishedAt: string;
  url: string;
  source: 'linkedin' | 'gupy' | 'indeed' | JobSource;
  description?: string;
  favorite?: boolean;
  applied?: boolean;
  dismissed?: boolean;
}

export interface SourceStatus {
  source: string;
  ok: boolean;
  count: number;
  error?: string | null;
}

export interface NotificationSettings {
  notifyAll: boolean;
  roles: string[];
  keywords: string[];
}

export interface MonitorStatus {
  paused: boolean;
  muted: boolean;
  scanning: boolean;
  nextCheckAt?: string | null;
  lastCheckAt?: string | null;
  sources: SourceStatus[];
  notificationSettings?: NotificationSettings;
}
