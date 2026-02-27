'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getChatHistory, sendChatMessage } from '@/lib/api-client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  results?: SearchResult[];
}

export interface SearchResult {
  id: string;
  name: string;
  description: string;
  type: 'hotel' | 'activity' | 'attraction' | 'restaurant';
  price?: number;
  rating?: number;
  lat: number;
  lng: number;
  icon?: string;
}

interface AIPlannerChatProps {
  tripId?: string | null;
  onTripCreated?: (tripId: string) => void;
  onExtracted?: (extracted: Record<string, any>) => void;
  onPlanGenerated?: (plan: any) => void;
  onCardDragStart?: (result: SearchResult) => void;
}

const sampleSuggestions = [
  'Plan a 3 day trip to Gokarna from Pune under INR 30000',
  'Can I cover 3 nearby destinations in 2 days?',
  'Suggest places for a budget trip',
  'Create a practical family trip plan',
];

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Tell me origin, destination, days, and budget. I'll suggest realistic places and coverage notes.",
  timestamp: new Date('1970-01-01T00:00:00.000Z'),
};

function formatChatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);
}

export function AIPlannerChat({ tripId, onTripCreated, onExtracted, onCardDragStart }: AIPlannerChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tripId) {
      setMessages([welcomeMessage]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const history = await getChatHistory(tripId);
        if (cancelled) {
          return;
        }
        if (!history.length) {
          setMessages([welcomeMessage]);
          return;
        }
        setMessages(
          history.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
            results: (m.results || []) as SearchResult[],
          }))
        );
      } catch {
        if (!cancelled) {
          setMessages([welcomeMessage]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const handleSendMessage = async (message: string = input) => {
    if (!message.trim()) {
      return;
    }
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await sendChatMessage({ message, trip_id: tripId || undefined });
      onTripCreated?.(result.trip_id);
      onExtracted?.(result.extracted || {});

      const warningText = (result.warnings || []).map((w) => `- ${w}`).join('\n');
      const assistant: ChatMessage = {
        id: result.assistant_message.id,
        role: 'assistant',
        content: warningText ? `${result.assistant_message.content}\n${warningText}` : result.assistant_message.content,
        timestamp: new Date(result.assistant_message.timestamp),
        results: (result.assistant_message.results || []) as SearchResult[],
      };
      setMessages((prev) => [...prev, assistant]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: 'assistant',
          content: 'Unable to reach planning service. Please verify backend is running and try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-none">
      <div className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-bold text-foreground text-base">AI Travel Assistant</h2>
          <p className="text-xs text-foreground/60">Real-time itinerary planning</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-3">
            <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs opacity-70 mt-1">{formatChatTime(message.timestamp)}</p>
              </div>
            </div>

            {message.results && message.results.length > 0 && (
              <div className="grid grid-cols-1 gap-2 ml-2">
                {message.results.map((result) => (
                  <div
                    key={result.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy';
                      e.dataTransfer.setData('text/plain', JSON.stringify(result));
                      onCardDragStart?.(result);
                    }}
                    className="p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-move hover:shadow-md hover:border-blue-300 transition group active:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm text-foreground">{result.name}</h4>
                        </div>
                        <p className="text-xs text-foreground/70 mb-2">{result.description}</p>
                        <div className="flex items-center gap-3 text-xs text-foreground/60">
                          <span className="px-2 py-1 bg-blue-100 rounded text-blue-700 font-medium">{result.type}</span>
                          {result.rating && <span>Rating {result.rating}</span>}
                          {result.price && <span className="font-semibold text-primary">INR {result.price}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 group-hover:text-gray-600 opacity-0 group-hover:opacity-100 transition">drag</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted text-foreground px-4 py-3 rounded-lg">Thinking...</div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="border-t border-border px-6 py-4">
          <p className="text-xs text-foreground/60 font-medium mb-3">Quick prompts:</p>
          <div className="grid grid-cols-1 gap-2">
            {sampleSuggestions.map((suggestion, i) => (
              <Button key={i} variant="outline" size="sm" onClick={() => handleSendMessage(suggestion)} className="justify-start text-left text-xs hover:bg-primary/5">
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Plan a 3 day trip to Gokarna from Pune..."
            disabled={isLoading}
            className="text-sm"
          />
          <Button onClick={() => handleSendMessage()} disabled={isLoading || !input.trim()} size="sm" className="gap-2 px-4">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
