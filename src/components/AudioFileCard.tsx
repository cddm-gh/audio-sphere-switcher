import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatTime, formatFileSize } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AudioFileCardProps {
  id: string;
  filename: string;
  createdAt: string;
  fileSize: number;
  duration: number;
  transcribed: boolean;
  transcription?: string;
  summary?: string | null;
}

export const AudioFileCard = ({
  id,
  filename,
  createdAt,
  fileSize,
  duration,
  transcribed,
  transcription,
  summary
}: AudioFileCardProps) => {
  const [showTranscription, setShowTranscription] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const { toast } = useToast();

  const handleTranscribe = async () => {
    try {
      const { error } = await supabase.functions.invoke('process-audio-file', {
        body: { storage_path: filename, filename }
      });
      console.log('processing audio file: ', filename)

      if (error) throw error;

      toast({
        title: "Transcription started",
        description: "The audio file is being transcribed. This may take a few minutes.",
      });
    } catch (error) {
      console.error('Error starting transcription:', error);
      toast({
        title: "Error",
        description: "Failed to start transcription. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card key={id} className="relative">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="font-medium truncate">{filename}</div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!transcribed && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTranscribe}
                  className="text-sm whitespace-nowrap"
                >
                  Transcribe
                </Button>
              )}
              {transcribed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTranscription(!showTranscription)}
                  className="text-sm whitespace-nowrap"
                >
                  {showTranscription ? 'Hide Transcription' : 'Show Transcription'}
                </Button>
              )}
              {transcribed && summary && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSummary(!showSummary)}
                  className="text-sm whitespace-nowrap"
                >
                  {showSummary ? 'Hide Summary' : 'Show Summary'}
                </Button>
              )}
            </div>
          </div>
          
          {transcribed && showTranscription && transcription && (
            <div className="mt-2 p-4 bg-muted rounded-md">
              <p className="text-sm whitespace-pre-wrap">{transcription}</p>
            </div>
          )}

          {transcribed && summary && showSummary && (
            <div className="mt-2 p-4 bg-muted rounded-md">
              <div className="prose prose-sm dark:prose-invert prose-p:my-2 prose-headings:my-3 max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Size: {formatFileSize(fileSize)}</span>
              <span className="hidden sm:inline">•</span>
              <span className="whitespace-nowrap">Duration: {formatTime(duration)}</span>
              <span className="hidden sm:inline">•</span>
            </div>
            {transcribed ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/10 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10 whitespace-nowrap">
                  Transcribed
                </span>
                {summary ? (
                  <span className="inline-flex items-center rounded-md bg-green-50 dark:bg-green-900/10 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-700/10 whitespace-nowrap">
                    Summarized
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-yellow-50 dark:bg-yellow-900/10 px-2 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 ring-1 ring-inset ring-yellow-700/10 whitespace-nowrap">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Summarizing
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-yellow-50 dark:bg-yellow-900/10 px-2 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 ring-1 ring-inset ring-yellow-700/10 whitespace-nowrap">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
