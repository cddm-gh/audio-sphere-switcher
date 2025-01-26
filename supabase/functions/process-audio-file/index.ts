// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient as createDeepgramClient } from "@deepgram/sdk"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { corsHeaders } from "../_shared/cors.ts"

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { filename, storage_path } = await req.json()
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    console.log(`Processing audio file in EdgeFunction: filename: ${filename}, storage_path: ${storage_path}`);

    console.log('Creating supabase client');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const audioFile = await getAudioFile(supabaseClient, storage_path);
    await transcribeFile(audioFile);
    console.log(`Processing file ${filename} completed.`);
    return new Response(
      JSON.stringify({ message: 'Processing Completed' }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      },
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error(`Error processing file ${filename}: ${JSON.stringify(error)}`);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: (error as { status?: number })?.status ?? 500,
      },
    )
  }
})

async function transcribeFile(audioFile: Blob) {
  console.log('Transcribing Audio File');
  const deepgramClient = createDeepgramClient(Deno.env.get('DEEPGRAM_API_KEY') ?? '');
  const readableStream = audioFile.stream();
  
  const transcription = await deepgramClient.listen.prerecorded.transcribeFile(readableStream, {
    model: "nova-2",
    smart_format: true,
    dictation: true,
    diarize: true,
    paragraphs: true,
    punctuate: true,
    language: "es-419",
  });
  console.log(`Transcription: ${JSON.stringify(transcription)}`);
}

async function getAudioFile(supabaseClient: SupabaseClient, storage_path: string) {
  console.log(`Getting Audio File ${storage_path}`);
  const { data: audioFile, error } = await supabaseClient.storage.from('audio').download(storage_path);
  if (error) {
    console.error(`Error downloading audio file ${storage_path}: ${error}`);
    throw error
  }
  return audioFile;
}
