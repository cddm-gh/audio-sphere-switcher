import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { AudioRecorder } from "@/components/AudioRecorder";
import { AudioPreview } from "@/components/AudioPreview";
import { AudioFileUpload } from "@/components/AudioFileUpload";
import { AudioFilesList } from "@/components/AudioFilesList";
import { AudioFile } from "@/types/audio";
import "@/styles/audio.css";

const Index = () => {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    // Check if user prefers dark mode
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [session, setSession] = useState<any>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileSize, setAudioFileSize] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PAGE_SIZE = 5;

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
  const fetchAudioFiles = async (loadMore = false) => {
    try {
      const currentPage = loadMore ? page + 1 : 0;
      setIsLoadingMore(loadMore);

      const { data, error, count } = await supabase
        .from('audio_uploads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);
      
      if (error) {
        console.error('Error fetching audio files:', error);
        return;
      }

      if (data) {
        setAudioFiles(prev => loadMore ? [...prev, ...data] : data);
        setHasMore(count !== null && (currentPage + 1) * PAGE_SIZE < count);
        setPage(currentPage);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchAudioFiles();

    // Subscribe to changes in the audio_uploads table
    const channel = supabase
      .channel('audio_uploads_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'audio_uploads'
        },
        async (payload) => {
          console.log('Received update:', payload);
          const updatedRecord = payload.new as AudioFile;
          
          // Update the audio files state immediately
          setAudioFiles(prev => 
            prev.map(file => 
              file.id === updatedRecord.id ? updatedRecord : file
            )
          );
          
          // If this is the file we're processing and it's now transcribed
          if (updatedRecord.transcribed && !updatedRecord.summary) {
            toast({
              title: "Complete",
              description: "Your audio file has been transcribed",
            });
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
              console.error('No session found');
              return;
            }

            console.log('Calling create_transcription_summary');
            await fetch('https://croosqxagovnhdhktxkr.supabase.co/functions/v1/create_transcription_summary', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                id: updatedRecord.id,
                transcription: updatedRecord.transcription,
                summary: updatedRecord.summary
              }),
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audio_uploads'
        },
        (payload) => {
          console.log('Received insert:', payload);
          const newRecord = payload.new as AudioFile;

          if (newRecord) {
            setIsUploading(false);
            setAudioFiles(prev => loadMore ? [...prev, newRecord] : [newRecord]);
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      console.log('Unsubscribing from channel');
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light';
      setTheme(newTheme);
      document.documentElement.classList.toggle('dark', e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    
    // Set initial theme
    document.documentElement.classList.toggle('dark', theme === 'dark');

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark");
  };

  const uploadAudio = async (file: File | Blob, duration?: number) => {
    const userId = session?.user?.id;
    if (!userId) {
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
      const fileName = `audio-${userId}-${Date.now()}.webm`;
      
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
          duration: duration || 0,
          file_size: file.size
        });

      if (dbError) throw dbError;

      // Fetch the updated list of audio files
      await fetchAudioFiles();

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

      // Show processing toast immediately
      toast({
        title: "Processing",
        description: "Your audio file is being processed",
      });
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

  const handleRecordingComplete = (url: string, blob: Blob, duration: number) => {
    setAudioUrl(url);
    setAudioFileSize(blob.size);
    setAudioDuration(duration);
    setCurrentAudioBlob(blob);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioUrl(URL.createObjectURL(file));
      setAudioFileSize(file.size);
      setCurrentAudioBlob(file);
      
      // Get audio duration
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      
      // Return a promise that resolves with the duration
      const duration = await new Promise<number>((resolve) => {
        audio.addEventListener('loadedmetadata', () => {
          const seconds = Math.floor(audio.duration);
          setAudioDuration(seconds);
          resolve(seconds);
        });
      });
      
      return duration;
    }
    return 0;
  };

  const handleUploadRecording = async () => {
    if (currentAudioBlob) {
      await uploadAudio(currentAudioBlob, audioDuration);
      handleReset();
    }
  };

  const handleReset = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioFileSize(0);
    setAudioDuration(0);
    setCurrentAudioBlob(null);
  };

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchAudioFiles(true);
    }
  };

  if (!session) {
    return null; // Don't render anything while checking auth
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <Navbar theme={theme} toggleTheme={toggleTheme} />
      
      <div className="container mx-auto px-4 py-8">
        {(uploadProgress > 0 && isUploading) && (
          <div className="mb-6 space-y-2">
            <Progress 
              value={uploadProgress} 
              className={`w-full h-2 transition-all duration-300 ${
                uploadProgress === 100 ? 'animate-pulse' : ''
              }`}
            />
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
              <p>
                {uploadProgress === 100 
                  ? 'Upload complete!'
                  : `Uploading... ${uploadProgress}%`}
              </p>
            </div>
          </div>
        )}

        {audioUrl && (
          <AudioPreview
            audioUrl={audioUrl}
            fileSize={audioFileSize}
            duration={audioDuration}
            onUpload={handleUploadRecording}
            onReset={handleReset}
            isUploading={isUploading}
          />
        )}

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <AudioRecorder 
            onRecordingComplete={handleRecordingComplete}
            isUploading={isUploading}
          />
          <AudioFileUpload
            onFileSelect={async (e) => { await handleFileChange(e); }}
            isUploading={isUploading}
          />
        </div>

        <AudioFilesList
          files={audioFiles}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
        />
      </div>
    </div>
  );
};

export default Index;