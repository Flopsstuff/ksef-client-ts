export type KsefSystemStatus = 'AVAILABLE' | 'MAINTENANCE' | 'FAILURE' | 'TOTAL_FAILURE';

export interface LighthouseMessage {
  id: string;
  eventId: string;
  category: string;
  type: string;
  title: string;
  text: string;
  start: string;
  end?: string;
  version: number;
  published: string;
}

export interface KsefStatusResponse {
  status: KsefSystemStatus;
  timestamp: string;
}

export interface KsefMessagesResponse {
  messages: LighthouseMessage[];
}
