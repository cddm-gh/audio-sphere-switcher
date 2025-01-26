import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mic, Upload, Pause, Square, Loader2, Play, Check, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
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
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioChunks(chunks);
        setIsRecordingComplete(true);
        setAudioUrl(URL.createObjectURL(blob));
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setIsRecordingComplete(false);
      toast({
        title: "Recording started",
        description: "Speak into your microphone",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  };

  const pauseRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.resume();
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setIsPaused(false);
      toast({
        title: "Recording completed",
        description: "Your audio is ready to preview",
      });
    }
  };

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const uploadAudio = async (file: File | Blob) => {
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
        });

      if (dbError) throw dbError;

      setUploadProgress(100);
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

      toast({
        title: "Processing",
        description: "Your audio file is being processed",
      });
      
      // Reset states after a brief delay
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 1500);
      
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadAudio(file);
      event.target.value = ''; // Reset input
      await fetchAudioFiles(); // Refresh the list after upload
    }
  };

  const handleStartOver = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioChunks([]);
    setIsRecordingComplete(false);
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
              className="w-full h-2 transition-all duration-300"
            />
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
              <p>
                {uploadProgress === 100 ? 'Upload complete!' : `Uploading... ${uploadProgress}%`}
              </p>
            </div>
          </div>
        )}

        {/* Add Audio Preview */}
        {audioUrl && (
          <Card className="mb-6">
            <CardContent className="pt-6">
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

                    <div className="flex flex-col items-center gap-1">
                      <div className="text-sm font-medium">
                        {isPaused ? "Paused" : "Recording..."}
                      </div>
                      {!isPaused && (
                        <div className="flex items-center text-xs text-muted-foreground gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          Live
                        </div>
                      )}
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
                  <div 
                    key={file.id} 
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{file.filename}</span>
                      <span className="text-sm text-muted-foreground">
                        Uploaded {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.transcribed ? (
                        <span className="text-sm text-green-500 flex items-center gap-1">
                          <Check className="h-4 w-4" />
                          Transcribed
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;