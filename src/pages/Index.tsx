import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, Play, Check, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Navbar } from "@/components/Navbar";
import ReactMarkdown from 'react-markdown';
import { AudioRecorder } from "@/components/AudioRecorder";
import { AudioPreview } from "@/components/AudioPreview";
import { AudioFileUpload } from "@/components/AudioFileUpload";
import { formatTime, formatFileSize } from "@/lib/format";
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
  summary?: string | null;
}

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
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());
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
        (payload) => {
          console.log('Received update:', payload);
          const updatedRecord = payload.new as AudioFile;
          
          // If this is the file we're processing and it's now transcribed
          if (updatedRecord.transcribed) {
            toast({
              title: "Complete",
              description: "Your audio file has been transcribed",
            });
          }
          
          fetchAudioFiles();
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
          fetchAudioFiles();
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
        {(uploadProgress > 0) && (
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
            onFileSelect={handleFileChange}
            isUploading={isUploading}
          />
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
                          <div className="flex items-center gap-2">
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
                            {file.transcribed && file.summary && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newExpandedSummaries = new Set(expandedSummaries);
                                  if (expandedSummaries.has(file.id)) {
                                    newExpandedSummaries.delete(file.id);
                                  } else {
                                    newExpandedSummaries.add(file.id);
                                  }
                                  setExpandedSummaries(newExpandedSummaries);
                                }}
                                className="text-sm"
                              >
                                {expandedSummaries.has(file.id) ? 'Hide Summary' : 'Show Summary'}
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {file.transcribed && expandedFiles.has(file.id) && (
                          <div className="mt-2 p-4 bg-muted rounded-md">
                            <p className="text-sm whitespace-pre-wrap">{file.transcription}</p>
                          </div>
                        )}

                        {file.transcribed && file.summary && expandedSummaries.has(file.id) && (
                          <div className="mt-2 p-4 bg-muted rounded-md">
                            <div className="prose prose-sm dark:prose-invert prose-p:my-2 prose-headings:my-3 max-w-none">
                              <ReactMarkdown>{file.summary}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Size: {formatFileSize(file.file_size)}</span>
                          <span>•</span>
                          <span>Duration: {formatTime(file.duration)}</span>
                          <span>•</span>
                          {file.transcribed ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/10 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10">
                                Transcribed
                              </span>
                              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                file.summary 
                                  ? "bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400 ring-green-700/10" 
                                  : "bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 ring-red-700/10"
                              }`}>
                                {file.summary ? "Summarized" : "Summary Pending"}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-md bg-yellow-50 dark:bg-yellow-900/10 px-2 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 ring-1 ring-inset ring-yellow-700/10">
                                Processing
                              </span>
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="gap-2"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        'Load More'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;