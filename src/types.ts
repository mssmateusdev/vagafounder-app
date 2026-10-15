export interface Filter {
  id: string;
  keyword: string;
  location: string;
  type: string;
  timeWindow: string;
  active: boolean;
}

export type JobSource = 'linkedin' | 'gupy' | 'indeed' | 'vagas' | 'trabalhabrasil' | 'infojobs' | 'catho' | string;

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
  source: JobSource;
  description?: string;
  salary?: string;
  benefits?: string[];
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

export interface ExternalNotifySettings {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  discordEnabled: boolean;
  discordWebhookUrl: string;
}

export interface MonitorStatus {
  paused: boolean;
  muted: boolean;
  scanning: boolean;
  nextCheckAt?: string | null;
  lastCheckAt?: string | null;
  sources: SourceStatus[];
  notificationSettings?: NotificationSettings;
  externalNotificationSettings?: ExternalNotifySettings;
}

export type KanbanStage = 'wishlist' | 'applied' | 'interview' | 'waiting' | 'offer';

export interface KanbanApplication {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  modality?: string;
  url: string;
  source: string;
  salary?: string;
  benefits?: string[];
  stage: KanbanStage;
  notes?: string;
  appliedAt: string;
  updatedAt: string;
}
