import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Loader2, Trash2, Check } from "lucide-react";
import { formatTime, formatFileSize } from "@/lib/format";

interface AudioPreviewProps {
  audioUrl: string;
  fileSize: number;
  duration: number;
  onUpload: () => Promise<void>;
  onReset: () => void;
  isUploading: boolean;
  isUploaded?: boolean;
}

export const AudioPreview = ({
  audioUrl,
  fileSize,
  duration,
  onUpload,
  onReset,
  isUploading,
  isUploaded = false
}: AudioPreviewProps) => {
  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Size: {formatFileSize(fileSize)}</span>
              <span>•</span>
              <span>Duration: {formatTime(duration)}</span>
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
                onClick={onReset}
                title="Start Over"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                onClick={onUpload}
                disabled={isUploading}
                className="gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : isUploaded ? (
                  <>
                    <Check className="h-4 w-4" />
                    Uploaded
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
  );
};
