# Audio Transcription App

A web application that allows users to record or upload audio files and automatically transcribe them using Deepgram's AI transcription service. Built with React, Supabase, and Deepgram.

## Features

- 🎤 Record audio directly from microphone
- 📁 Upload audio files
- 🔄 Real-time upload progress
- 🤖 AI-powered transcription
- 🎯 Multi-speaker detection
- 🌓 Dark/Light theme support
- 🔒 User authentication

## Tech Stack

- Vite
- TypeScript
- React
- Supabase (Auth, Storage, Database)
- Deepgram API
- shadcn/ui
- Tailwind CSS

## Prerequisites

- Deno - [install instructions](https://deno.land/manual/getting_started/installation)
- Supabase account
- Deepgram API key

## Environment Variables

For the Supabase Edge Function:

```bash
supabase secrets set --env-file .env
```

Create a `.env` file:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

## Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd <project-directory>
```

2. Start the Edge Function locally:
```bash
supabase start
deno task dev
```

3. Deploy the Edge Function:
```bash
supabase functions deploy process-audio-file
```

## Testing

Run tests with:
```bash
deno test
```

## Database Schema

```sql
create table audio_uploads (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  filename text not null,
  storage_path text not null,
  transcribed boolean default false,
  transcription text
);
```

## Usage

1. Sign in using your Supabase credentials
2. Choose between recording audio or uploading an audio file
3. The audio will be automatically uploaded to Supabase Storage
4. The Edge Function will process the audio using Deepgram
5. View the transcription in your Supabase database

## Storage Bucket Setup

Create a new storage bucket in Supabase called `audio` with the following policy:

```sql
CREATE POLICY "Allow authenticated users to upload audio files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audio');
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License
