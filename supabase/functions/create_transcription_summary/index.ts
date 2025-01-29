import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { SupabaseClient} from 'jsr:@supabase/supabase-js'
import { createSupabaseAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  console.log('EF create_transcript_summary');
  const { id, transcription } = await req.json()
  
  console.log(`Sending ${transcription.substring(0, 50)} to OpenAI`);

  const summary = "Hello, world!";

  const supabaseClient = createSupabaseAdminClient();
  await updateAudioSummary(supabaseClient, id, summary);

  console.log(`Summary updated for audio ${id}`);
  return new Response(
    JSON.stringify({ summary }),
    { headers: { "Content-Type": "application/json" } },
  );
});

async function updateAudioSummary(supabaseClient: SupabaseClient, id: string, summary: string) {
  const { error } = await supabaseClient
    .from('audio_uploads')
    .update({ summary: summary })
    .eq('id', id)
    .select();

  if (error) {
    console.error(`Error updating audio summary for ${id}: ${error}`);
    throw error
  }
}
