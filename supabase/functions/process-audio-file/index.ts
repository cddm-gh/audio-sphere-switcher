import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient as createDeepgramClient, CallbackUrl } from "@deepgram/sdk"
import { SupabaseClient } from "jsr:@supabase/supabase-js"
import { corsHeaders } from "../_shared/cors.ts"
import { createSupabaseClient } from "../_shared/supabaseClient.ts"
import { Buffer } from "node:buffer";

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
    const supabaseClient = createSupabaseClient(authHeader);

    const audioFile = await getAudioFile(supabaseClient, storage_path);
    const fileTranscriptionReqId = await transcribeFile(audioFile);
    // Save Deepgram request id to audio_uploads table to identify the transcription later
    console.log(`${filename} sent to Deepgram for transcription. ReqId: ${fileTranscriptionReqId}`);
    await updateAudioWithReqId(supabaseClient, filename, fileTranscriptionReqId);

    return new Response(
      JSON.stringify({ message: 'Upload Completed' }),
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

async function transcribeFile(audioFile: Blob): Promise<string> {
  console.log('Transcribing Audio File');
  const deepgramClient = createDeepgramClient(Deno.env.get('DEEPGRAM_API_KEY') ?? '');
  
  // Convert Blob to ArrayBuffer then to Buffer
  const buffer = Buffer.from(await audioFile.arrayBuffer());
  const updateFuncBase = Deno.env.get('UPDATE_TRANSCRIPTION_FUNC_URL') ?? '';
  const updateFuncURL = new CallbackUrl(updateFuncBase);

  console.log(`Update Function URL: ${updateFuncURL}`);
  const { result } = await deepgramClient.listen.prerecorded.transcribeFileCallback(buffer, updateFuncURL, {
    model: "nova-2",
    smart_format: true,
    dictation: true,
    diarize: true,
    paragraphs: true,
    punctuate: true,
    detect_language: true,
  });

  if (!result) {
    console.error('No transcription result');
    throw new Error('No transcription result');
  }

  console.log(`Transcription result: ${result.request_id}`);
  return result.request_id;
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

async function updateAudioWithReqId(supabaseClient: SupabaseClient, filename: string, reqId: string) {
    const { data: updatedData, error: transcriptionError } = await supabaseClient
      .from('audio_uploads')
      .update({
        deepgram_request_id: reqId,
      })
      .eq('filename', filename)
      .select();

    if (transcriptionError) {
      console.error(`Error saving transcription to supabase: ${JSON.stringify(transcriptionError)}`);
      throw transcriptionError;
    }

    if (!updatedData || updatedData.length === 0) {
      throw new Error(`No rows updated for filename: ${filename}`);
    }

    console.log(`Uploading audio file ${filename} with reqId: ${reqId} completed.`);
}