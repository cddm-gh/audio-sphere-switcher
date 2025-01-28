export interface AudioFile {
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
