const configuredVoiceBase = (process.env.NEXT_PUBLIC_VOICE_BACKEND_URL || '').trim();
const VOICE_BASE_URL = (configuredVoiceBase || 'http://localhost:8002').replace(/\/+$/, '');

export type VoiceStage =
  | 'discover'
  | 'itinerary_selection'
  | 'collect_trip_meta'
  | 'hotel_confirmation'
  | 'hotel_query'
  | 'hotel_results'
  | 'transport_results'
  | 'checkout';

export interface VoiceContextPayload {
  stage: VoiceStage;
  destination?: string;
  origin?: string;
  trip_name?: string;
  planned_days?: number;
  known_places?: string[];
  hotel_results?: string[];
  transport_results?: string[];
}

export interface VoiceCommandResult {
  intent: string;
  stage: VoiceStage;
  reply: string;
  actions: Array<Record<string, any>>;
  entities: Record<string, any>;
}

async function voiceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${VOICE_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voice API ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

export async function parseVoiceCommand(text: string, context: VoiceContextPayload): Promise<VoiceCommandResult> {
  return voiceFetch<VoiceCommandResult>('/voice/command', {
    method: 'POST',
    body: JSON.stringify({ text, context }),
  });
}

export async function buildSpokenResponse(text: string, targetLanguageCode = 'en-IN'): Promise<string> {
  try {
    const data = await voiceFetch<{ text?: string }>('/voice/speak', {
      method: 'POST',
      body: JSON.stringify({ text, target_language_code: targetLanguageCode }),
    });
    return String(data.text || text);
  } catch {
    return text;
  }
}

export async function transcribeVoiceAudio(
  audioBlob: Blob,
  languageCode = 'en-IN',
  translateToEnglish = true
): Promise<string> {
  const form = new FormData();
  form.append('audio', audioBlob, 'voice-input.webm');
  form.append('language_code', languageCode);
  form.append('translate_to_english', String(translateToEnglish));

  const response = await fetch(`${VOICE_BASE_URL}/voice/transcribe`, {
    method: 'POST',
    body: form,
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voice API ${response.status}: ${body}`);
  }
  const data = (await response.json()) as { text?: string; error?: string };
  if (data.error) {
    throw new Error(data.error);
  }
  return String(data.text || '').trim();
}

export function getVoiceBackendBaseUrl(): string {
  return VOICE_BASE_URL;
}
