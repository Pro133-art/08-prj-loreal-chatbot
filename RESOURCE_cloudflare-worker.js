// Copy this code into your Cloudflare Worker script.
// It receives chat messages from the frontend and forwards them to OpenAI.

export default {
  async fetch(request, env) {
    // CORS headers let the browser call this worker from your frontend page.
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Browser sends OPTIONS first for preflight checks.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // In Cloudflare dashboard, store your secret as OPENAI_API_KEY.
    const apiKey = env.OPENAI_API_KEY;
    const openAiUrl = "https://api.openai.com/v1/chat/completions";

    // Frontend sends: { messages: [...] }
    const userInput = await request.json();

    const requestBody = {
      model: "gpt-4o",
      messages: userInput.messages,
      max_completion_tokens: 300,
    };

    const openAiResponse = await fetch(openAiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await openAiResponse.json();

    // Send OpenAI JSON back to the frontend.
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  },
};
