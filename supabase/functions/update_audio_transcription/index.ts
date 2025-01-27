import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  const body = await req.json()
  console.log(`The body is: ${JSON.stringify(body)}`)
  
  return new Response(
    JSON.stringify({ message: 'Success' }),
    { headers: { "Content-Type": "application/json" } },
  );
});
