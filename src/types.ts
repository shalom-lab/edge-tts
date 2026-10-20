export interface VoiceItem {
  shortName: string;
  name: string;
  locale: string;
  gender: string;
  friendlyName: string;
  label: string;
  desc: string;
  tags: string[];
  featured: boolean;
  category: 'zh-mainland' | 'zh-dialect' | 'zh-other' | 'en' | 'ja-ko' | 'other';
  suggestedCodec: string;
}

export interface ProsodyConfig {
  rate: number; // -50 to 100 percentage
  pitch: number; // -50 to 50 Hz
  volume: number; // -50 to 50 percentage
  format: string; // 'audio-24khz-96kbitrate-mono-mp3' | 'audio-24khz-48kbitrate-mono-mp3' | 'webm-24khz-16bit-mono-opus'
}

export interface SynthHistoryItem {
  id: string;
  text: string;
  voice: string;
  voiceLabel: string;
  config: ProsodyConfig;
  audioBlobUrl: string;
  fileSize: number;
  durationMs: number;
  timestamp: number;
}

export interface PresetSample {
  id: string;
  category: string;
  title: string;
  text: string;
  recommendedVoice?: string;
}
