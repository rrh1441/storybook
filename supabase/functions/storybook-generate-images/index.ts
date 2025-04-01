// supabase/functions/storybook-generate-images/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@^2.40.0'; // Use specific version
// Deno doesn't have Buffer built-in, handle base64 manually if needed
import { decode as base64Decode } from "https://deno.land/std@0.208.0/encoding/base64.ts"; // Check for latest std version

const falApiKey = Deno.env.get('FAL_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!falApiKey || !supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables (FAL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
}

// Initialize Supabase Admin Client (run once)
const supabaseAdmin: SupabaseClient = createClient(supabaseUrl!, supabaseServiceKey!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAL_API_HOST = "https://fal.run"; // Or specific region if needed
const FAL_MODEL_ENDPOINT = "/fal-ai/flux-image-to-image"; // Update if endpoint changes
// --- UPDATED BUCKET NAME ---
const STORAGE_BUCKET = "storybook-assets";
// ---------------------------

// --- Helper: Generate short summary for image prompt ---
// (Very basic implementation - enhance with NLP later if needed)
function createSummary(text: string, maxLength = 50): string {
    if (!text) return "A scene from the story";
    // Remove markdown, extra spaces, take first few words
    const cleanedText = text.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
    const words = cleanedText.split(' ');
    // Aim for roughly 10-15 words, but respect maxLength
    const maxWords = Math.min(15, Math.floor(maxLength / 5)); // Rough estimate
    let summary = words.slice(0, maxWords).join(' ');
    if (summary.length > maxLength) {
        summary = summary.substring(0, maxLength - 3) + "...";
    } else if (words.length > maxWords) {
        summary += "...";
    }
     if (!summary) return "A scene from the story"; // Handle empty text case
    return summary;
}
// ---

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
     if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
     }
    if (!falApiKey) {
        return new Response(JSON.stringify({ error: 'Image generation provider not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    try {
        const { storybook_id, reference_image_url } = await req.json();

        if (!storybook_id || !reference_image_url) {
            throw new Error("Missing required parameters: storybook_id and reference_image_url");
        }

        console.log(`Starting image generation for storybook_id: ${storybook_id}`);

        // 1. Fetch pages for the storybook
        const { data: pages, error: fetchError } = await supabaseAdmin
            .from('storybook_pages')
            .select('id, page_number, text')
            .eq('storybook_id', storybook_id)
            .order('page_number', { ascending: true });

        if (fetchError) throw fetchError;
        if (!pages || pages.length === 0) throw new Error("No pages found for this storybook.");

        console.log(`Found ${pages.length} pages to process.`);

        // 2. Process each page (consider running in parallel later for performance)
        for (const page of pages) {
            const pageId = page.id;
            const pageNum = page.page_number;
            const pageText = page.text || ""; // Handle potentially null text

             // Update status to 'generating'
             await supabaseAdmin
               .from('storybook_pages')
               .update({ image_status: 'generating', updated_at: new Date().toISOString() })
               .eq('id', pageId);

            console.log(`Generating image for page ${pageNum}...`);

            try {
                // a. Create image prompt
                const summary = createSummary(pageText);
                const imagePrompt = `Children's storybook illustration, whimsical and bright style. Scene showing: ${summary}`;
                 await supabaseAdmin.from('storybook_pages').update({ image_prompt: imagePrompt }).eq('id', pageId); // Store the prompt

                // b. Call Fal AI API
                const falInput = {
                    "image_url": reference_image_url,
                    "prompt": imagePrompt,
                    // Add other Fal parameters if needed: seed, strength, etc.
                     "seed": Math.floor(Math.random() * 100000), // Add random seed
                     "strength": 0.6 // Example strength
                };

                console.log(`Calling Fal AI for page ${pageNum} with prompt: "${imagePrompt}"`);
                const falResponse = await fetch(FAL_API_HOST + FAL_MODEL_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Authorization": `Key ${falApiKey}`,
                        "Content-Type": "application/json",
                        "Accept": "application/json" // Expect JSON response containing image data
                    },
                    body: JSON.stringify({ inputs: falInput }) // Check Fal docs for exact payload structure
                });

                if (!falResponse.ok) {
                     const errorBody = await falResponse.text();
                    throw new Error(`Fal AI API Error (${falResponse.status}): ${errorBody}`);
                }

                const falResult = await falResponse.json();
                // Check Fal AI documentation for the exact response structure.
                // Assuming it returns something like { images: [{ url: "...", content_type: "...", content: "base64..." }] }
                 // Let's assume content is base64 for now. Adjust if it returns a direct URL or buffer.
                if (!falResult || !falResult.images || !falResult.images[0] || !falResult.images[0].content) {
                    console.error("Unexpected Fal AI response structure:", falResult);
                    throw new Error("Invalid response format from Fal AI.");
                }
                const base64Image = falResult.images[0].content;
                const contentType = falResult.images[0].content_type || 'image/png'; // Default to png

                // c. Decode Base64 and get ArrayBuffer
                const imageBuffer = base64Decode(base64Image).buffer;

                // d. Upload to Supabase Storage
                const filePath = `images/${storybook_id}/page_${pageNum}.png`; // Use png extension
                console.log(`Uploading image for page ${pageNum} to storage bucket '${STORAGE_BUCKET}': ${filePath}`); // Log bucket name
                const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
                    .from(STORAGE_BUCKET) // Using the updated constant
                    .upload(filePath, imageBuffer, {
                        contentType: contentType,
                        upsert: true // Overwrite if it exists (useful for regeneration)
                    });

                if (uploadError) throw uploadError;

                // e. Get Public URL
                console.log(`Getting public URL from bucket '${STORAGE_BUCKET}' for path: ${filePath}`); // Log bucket name
                const { data: urlData } = supabaseAdmin.storage
                    .from(STORAGE_BUCKET) // Using the updated constant
                    .getPublicUrl(filePath);

                if (!urlData || !urlData.publicUrl) throw new Error("Failed to get public URL for uploaded image.");
                const publicUrl = urlData.publicUrl;

                // f. Update storybook_pages table
                await supabaseAdmin
                    .from('storybook_pages')
                    .update({
                        image_url: publicUrl,
                        image_status: 'completed',
                        updated_at: new Date().toISOString()
                     })
                    .eq('id', pageId);

                console.log(`Successfully processed page ${pageNum}. Image URL: ${publicUrl}`);

            } catch (pageError) {
                console.error(`Error processing page ${pageNum} (ID: ${pageId}):`, pageError);
                 // Update status to 'failed'
                 await supabaseAdmin
                    .from('storybook_pages')
                    .update({ image_status: 'failed', updated_at: new Date().toISOString() })
                    .eq('id', pageId);
                // Continue to the next page even if one fails
            }
        } // end for loop

        console.log(`Finished image generation process for storybook_id: ${storybook_id}`);
        return new Response(JSON.stringify({ success: true, message: `Image generation process completed for ${pages.length} pages.` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Error in storybook-generate-images function:", error);
        const message = error instanceof Error ? error.message : 'Failed to generate images.';
        return new Response(JSON.stringify({ error: message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});

console.log("Storybook image generation function handler registered.");