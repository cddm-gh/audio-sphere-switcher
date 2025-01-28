import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload } from "lucide-react";

interface AudioFileUploadProps {
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  isUploading: boolean;
}

export const AudioFileUpload = ({ onFileSelect, isUploading }: AudioFileUploadProps) => {
  return (
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
              onChange={onFileSelect}
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
  );
};
