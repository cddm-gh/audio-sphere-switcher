import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { AudioFileCard } from "./AudioFileCard";
import { AudioFile } from "@/types/audio";

interface AudioFilesListProps {
  files: AudioFile[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export const AudioFilesList = ({
  files,
  hasMore,
  isLoadingMore,
  onLoadMore
}: AudioFilesListProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Uploads</CardTitle>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-center text-muted-foreground">No audio files uploaded yet</p>
        ) : (
          <div className="space-y-4">
            {files.map((file) => (
              <AudioFileCard
                key={file.id}
                id={file.id}
                filename={file.filename}
                createdAt={file.created_at}
                fileSize={file.file_size}
                duration={file.duration}
                transcribed={file.transcribed}
                transcription={file.transcription}
                summary={file.summary}
              />
            ))}
            
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={onLoadMore}
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
  );
};
