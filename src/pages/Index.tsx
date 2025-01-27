import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mic, Upload, Pause, Square, Loader2, Play, Check, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { Navbar } from "@/components/Navbar";
import "@/styles/audio.css";

interface AudioFile {
  id: string;
  filename: string;
  storage_path: string;
  created_at: string;
  transcribed: boolean;
  transcription?: string;
  user_id: string;
  duration: number;
  file_size: number;
}

const Index = () => {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [session, setSession] = useState<any>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecordingComplete, setIsRecordingComplete] = useState(false);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioFileSize, setAudioFileSize] = useState<number>(0);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fetch audio files on mount and after uploads
  const fetchAudioFiles = async () => {
    const { data, error } = await supabase
      .from('audio_uploads')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching audio files:', error);
      return;
    }
    
    setAudioFiles(data);
  };

  useEffect(() => {
    fetchAudioFiles();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark");
  };

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
        setAudioChunks(chunks);
        setIsRecordingComplete(true);
        setAudioUrl(URL.createObjectURL(blob));
        setAudioFileSize(blob.size);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setIsRecordingComplete(false);
      setRecordingDuration(0);
      
      // Start the timer
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast({
        title: "Recording started",
        description: "Speak into your microphone",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start recording",
        variant: "destructive",
      });
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

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const uploadAudio = async (file: File | Blob, duration?: number) => {
    if (!session?.user?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to upload audio",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      const fileName = `audio-${Date.now()}.webm`;
      
      // Simulate progress updates for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 300);

      // Upload to storage
      const { data: storageData, error: uploadError } = await supabase.storage
        .from("audio")
        .upload(fileName, file, {
          contentType: "audio/webm",
        });

      clearInterval(progressInterval);
      if (uploadError) throw uploadError;

      // Create database record
      const { error: dbError } = await supabase
        .from("audio_uploads")
        .insert({
          user_id: session.user.id,
          filename: fileName,
          storage_path: storageData.path,
          duration: duration || recordingDuration,
          file_size: file.size
        });

      if (dbError) throw dbError;

      // Set progress to 100% with a smooth transition
      setUploadProgress(100);
      
      // Reset states immediately
      setIsUploading(false);

      // Show success toast after states are updated
      toast({
        title: "Success",
        description: "Audio uploaded successfully",
      });

      // Get the access token from the session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const accessToken = currentSession?.access_token;

      if (!accessToken) {
        throw new Error("No access token available");
      }

      // Call the edge function to process the audio file
      const functionUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
      const response = await fetch(
        `${functionUrl}/v1/process-audio-file`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            filename: fileName,
            storage_path: storageData.path,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to process audio file");
      }

      setIsProcessing(true);
      toast({
        title: "Processing",
        description: "Your audio file is being processed",
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload audio",
        variant: "destructive",
      });
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const resetRecordingState = () => {
    setAudioChunks([]);
    setIsRecordingComplete(false);
    setIsRecording(false);
    setIsPaused(false);
  };

  const handleUploadRecording = async () => {
    if (audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      await uploadAudio(audioBlob);
      resetRecordingState();
      await fetchAudioFiles(); // Refresh the list after upload
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioUrl(URL.createObjectURL(file));
      setAudioFileSize(file.size);
      
      // Get audio duration
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      
      // Return a promise that resolves with the duration
      const duration = await new Promise<number>((resolve) => {
        audio.addEventListener('loadedmetadata', () => {
          const seconds = Math.floor(audio.duration);
          setRecordingDuration(seconds);
          resolve(seconds);
        });
      });
      
      setIsRecordingComplete(true);
      return duration;
    }
    return 0;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const duration = await handleFileChange(event);
        await uploadAudio(file, duration);
        event.target.value = ''; // Reset input
        await fetchAudioFiles(); // Refresh the list after upload
      } catch (error) {
        console.error('Error handling file upload:', error);
      }
    }
  };

  const handleStartOver = () => {
    setAudioUrl(null);
    setAudioChunks([]);
    setIsRecordingComplete(false);
    setRecordingDuration(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  if (!session) {
    return null; // Don't render anything while checking auth
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <Navbar theme={theme} toggleTheme={toggleTheme} />
      
      <div className="container mx-auto px-4 py-8">
        {uploadProgress > 0 && (
          <div className="mb-6 space-y-2">
            <Progress 
              value={uploadProgress} 
              className={`w-full h-2 transition-all duration-300 ${
                uploadProgress === 100 && isProcessing ? 'animate-pulse' : ''
              }`}
            />
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
              <p>
                {uploadProgress === 100 
                  ? (isProcessing ? 'Processing audio...' : 'Upload complete!') 
                  : `Uploading... ${uploadProgress}%`}
              </p>
            </div>
          </div>
        )}

        {/* Add Audio Preview */}
        {audioUrl && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Size: {formatFileSize(audioFileSize)}</span>
                    <span>•</span>
                    <span>Duration: {formatTime(recordingDuration)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <audio 
                      src={audioUrl} 
                      controls 
                      className="w-full custom-audio"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleStartOver}
                      title="Start Over"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={handleUploadRecording}
                      disabled={isUploading}
                      className="gap-2"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2 mb-8">
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
                {isRecordingComplete && (
                  <Button 
                    variant="secondary" 
                    onClick={handleUploadRecording}
                    className="gap-2"
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Upload Recording
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upload Audio File</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <div className="relative">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="audio-upload"
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="audio-upload"
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-all duration-300 ${
                      isUploading 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'cursor-pointer hover:bg-accent'
                    }`}
                  >
                    {isUploading ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mb-2" />
                        <span className="text-sm">Click to upload or drag and drop</span>
                        <span className="text-xs text-muted-foreground">Audio files only</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audio Files List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {audioFiles.length === 0 ? (
              <p className="text-center text-muted-foreground">No audio files uploaded yet</p>
            ) : (
              <div className="space-y-4">
                {audioFiles.map((file) => (
                  <Card key={file.id} className="relative">
                    <CardContent className="pt-6">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{file.filename}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                            </div>
                          </div>
                          {file.transcribed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newExpandedFiles = new Set(expandedFiles);
                                if (expandedFiles.has(file.id)) {
                                  newExpandedFiles.delete(file.id);
                                } else {
                                  newExpandedFiles.add(file.id);
                                }
                                setExpandedFiles(newExpandedFiles);
                              }}
                              className="text-sm"
                            >
                              {expandedFiles.has(file.id) ? 'Hide Transcription' : 'Show Transcription'}
                            </Button>
                          )}
                        </div>
                        
                        {file.transcribed && expandedFiles.has(file.id) && (
                          <div className="mt-2 p-4 bg-muted rounded-md">
                            <p className="text-sm whitespace-pre-wrap">{file.transcription}</p>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{formatFileSize(file.file_size)}</span>
                          <span>•</span>
                          <span>{formatTime(file.duration)}</span>
                          <span>•</span>
                          <span>{file.transcribed ? 'Transcribed' : 'Processing...'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secondsRemaining = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secondsRemaining.toString().padStart(2, '0')}`;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default Index;