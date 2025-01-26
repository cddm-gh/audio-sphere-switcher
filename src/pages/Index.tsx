import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Mic, Upload, Sun, Moon, Pause, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

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
        setAudioChunks(chunks);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
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

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      toast({
        title: "Recording stopped",
        description: "Your audio has been recorded",
      });
    }
  };

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAudio(file);
    }
  };

  const handleUploadRecording = () => {
    if (audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      uploadAudio(audioBlob);
    }
  };

  if (!session) {
    return null; // Don't render anything while checking auth
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-end mb-6">
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Record Audio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center gap-4">
                {!isRecording ? (
                  <Button onClick={startRecording}>
                    <Mic className="mr-2 h-4 w-4" />
                    Start Recording
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={stopRecording}>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </Button>
                    <Button variant="destructive" onClick={stopRecording}>
                      <Square className="mr-2 h-4 w-4" />
                      Stop
                    </Button>
                  </>
                )}
              </div>
              {audioChunks.length > 0 && (
                <Button onClick={handleUploadRecording} className="w-full">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Recording
                </Button>
              )}
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
                      <>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2" />
                        <span className="text-sm">Uploading...</span>
                      </>
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
              {uploadProgress > 0 && (
                <div className="space-y-2">
                  <Progress 
                    value={uploadProgress} 
                    className="w-full transition-all duration-300"
                  />
                  <p className="text-sm text-center text-muted-foreground">
                    {uploadProgress === 100 ? 'Upload complete!' : `Uploading... ${uploadProgress}%`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;