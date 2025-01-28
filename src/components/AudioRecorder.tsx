import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Upload, Pause, Square, Loader2, Play } from "lucide-react";
import { formatTime } from "@/lib/format";

interface AudioRecorderProps {
  onRecordingComplete: (audioUrl: string, audioBlob: Blob, duration: number) => void;
  isUploading: boolean;
}

export const AudioRecorder = ({ onRecordingComplete, isUploading }: AudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);
        setAudioChunks(chunks);
        onRecordingComplete(audioUrl, blob, recordingDuration);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      
      // Start the timer
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.pause();
      setIsPaused(true);
      // Pause the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.resume();
      setIsPaused(false);
      // Resume the timer
      if (!timerRef.current) {
        timerRef.current = window.setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setIsPaused(false);
      // Stop the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Audio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4">
          {!isRecording ? (
            <Button 
              size="lg" 
              className="w-16 h-16 rounded-full"
              onClick={startRecording}
              disabled={isUploading}
            >
              <Mic className="h-6 w-6" />
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="text-sm font-medium mb-2">
                {formatTime(recordingDuration)}
              </div>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="w-12 h-12 rounded-full"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                >
                  {isPaused ? (
                    <Play className="h-6 w-6" />
                  ) : (
                    <Pause className="h-6 w-6" />
                  )}
                </Button>
                
                <Button
                  variant="destructive"
                  size="icon"
                  className="w-12 h-12 rounded-full relative"
                  onClick={stopRecording}
                >
                  <Square className="h-6 w-6" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
