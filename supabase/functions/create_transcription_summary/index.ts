import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { SupabaseClient} from 'jsr:@supabase/supabase-js'
import { createSupabaseAdminClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  console.log('EF create_transcript_summary ', JSON.stringify(req.body));
  const { id, transcription } = await req.json();

  if (!transcription) {
    console.error('No transcription provided');
    throw new Error('No transcription provided');
  }

  console.log(`Sending ${transcription.substring(0, 50)} to OpenAI`);

  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    console.error('OpenAI API key not found');
    throw new Error('OpenAI API key not found');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Create a concise summary of this audio transcription, focusing on the main topics and sub topics. There could be multiple spikers identified by "Speaker #". Don`t make a summary with just bullet points. The final format should be in markdown'
        },
        {
          role: 'user',
          content: `Summarize this transcription in the original language and return the summary in markdown format: ${transcription}`
        }
      ],
      max_tokens: 5000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  console.log('OpenAI response:', JSON.stringify(response));
  const result = await response.json();
  const summaryFromApi = result.choices[0].message.content.trim();
  const generatedSummary = summaryFromApi.replace(/\\n/g, '\n');

  const supabaseClient = createSupabaseAdminClient();
  await updateAudioSummary(supabaseClient, id, generatedSummary);

  return new Response(
    JSON.stringify({ generatedSummary }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function updateAudioSummary(supabaseClient: SupabaseClient, id: string, summary: string) {
  console.log(`Updating audio summary for ${id} with summary: ${summary}`);
  const { error } = await supabaseClient
    .from('audio_uploads')
    .update({ summary: summary })
    .eq('id', id)
    .select();

  if (error) {
    console.error(`Error updating audio summary for ${id}: ${JSON.stringify(error)}`);
    throw error
  }

  console.log(`Summary created for audio ${id}`);
}
