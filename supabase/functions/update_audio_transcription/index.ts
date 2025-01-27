import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { SupabaseClient} from 'jsr:@supabase/supabase-js'
import { createSupabaseAdminClient } from '../_shared/supabaseAdmin.ts';
import type { DataType, Paragraph, Results } from "./types.ts";

Deno.serve(async (req) => {
  const body = await req.json()
  console.log(`In update_audio_transcription, the body is: ${JSON.stringify(body)}`);
  const headers: Headers = req.headers;
  console.log(`In update_audio_transcription, the headers are: ${JSON.stringify(Object.fromEntries(headers))}`);
  const DG_TOKEN = headers.get("dg-token");
  const DG_API_KEY_ID = Deno.env.get("DEEPGRAM_API_KEY_ID");

  if (DG_TOKEN !== DG_API_KEY_ID) {
    console.error("API KEY not match with dg-token header")
    return new Response("Forbidden", { status: 403 });
  }

  const { metadata, results } = body as DataType;
  console.log(`Transcription result for ${metadata.request_id} - ${JSON.stringify(results)}`);
  const transcription = processTranscription(results);
  const supabaseClient = createSupabaseAdminClient();
  await updateAudioTranscription(supabaseClient, metadata.request_id, transcription);

  console.log(`Updated audio transcription for ${metadata.request_id}`);
  return new Response(
    JSON.stringify({ message: 'Success' }),
    { headers: { "Content-Type": "application/json" } },
  );
});

function processTranscription(transcriptionResults: Results): string {
  // Process and create formatted output
  const paragraphs = transcriptionResults?.channels?.[0]?.alternatives?.[0].paragraphs?.paragraphs;
  const formattedText = paragraphs?.map((p: Paragraph) => `Speaker ${p.speaker}: ${p.sentences.map((s) => s.text).join(' ')}`)
            .join('\n\n') ?? '';

  console.log(`Formatted Transcription: ${formattedText}`);
  return formattedText;
}

async function updateAudioTranscription(supabaseClient: SupabaseClient, reqId: string, transcription: string) {
  console.log(`Updating audio file with transcription for ${reqId}`);
  const { error } = await supabaseClient
    .from('audio_uploads')
    .update({ transcription: transcription, transcribed: true })
    .eq('deepgram_request_id', reqId)
    .select();

  if (error) {
    console.error(`Error updating audio transcription for ${reqId}: ${error}`);
    throw error
  }
}