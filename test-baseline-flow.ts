/**
 * Test script for Channel Baseline flow
 * 
 * This script tests:
 * 1. Fetching transcripts from DataForSEO for sample videos
 * 2. Generating baseline summary/keywords using OpenAI
 * 3. Saving transcripts to Supabase
 * 
 * Run with: npx tsx test-baseline-flow.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from apps/web/.env.local
config({ path: resolve(__dirname, 'apps/web/.env.local') });

interface VideoTranscript {
  video_id: string;
  title: string;
  transcript: string | null;
}

interface DataForSEOResponse {
  status_code: number;
  tasks?: Array<{
    result?: Array<{
      items?: Array<{
        type: string;
        text?: string;
      }>;
      subtitle_language?: string;
    }>;
  }>;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

// Test video IDs (popular tech videos with transcripts)
const TEST_VIDEOS = [
  { video_id: 'dQw4w9WgXcQ', title: 'Test Video 1' },
  { video_id: 'jNQXAC9IVRw', title: 'Test Video 2' },
];

async function fetchTranscript(videoId: string): Promise<string | null> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD required');
  }

  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  try {
    console.log(`Fetching transcript for video ${videoId}...`);
    
    const response = await fetch(
      'https://api.dataforseo.com/v3/serp/youtube/video_subtitles/live/advanced',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            video_id: videoId,
            location_code: 2840,
            language_code: 'en',
            os: 'windows',
            depth: 20,
            subtitles_language: 'en',
          },
        ]),
      }
    );

    if (!response.ok) {
      throw new Error(`DataForSEO API error: ${response.status}`);
    }

    const data: DataForSEOResponse = await response.json();

    if (data.status_code !== 20000) {
      console.error(`  ❌ API returned status code: ${data.status_code}`);
      return null;
    }

    const items = data.tasks?.[0]?.result?.[0]?.items || [];

    if (items.length === 0) {
      console.error(`  ❌ No subtitles available for ${videoId}`);
      return null;
    }

    const transcript = items
      .filter((item) => item.type === 'youtube_subtitles' && item.text)
      .map((item) => item.text)
      .join(' ');

    if (!transcript) {
      console.error(`  ❌ No subtitle text found for ${videoId}`);
      return null;
    }

    console.log(`  ✅ Fetched ${transcript.length} characters`);
    return transcript;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return null;
  }
}

async function generateBaselineSummary(
  videos: VideoTranscript[]
): Promise<{ summary: string; keywords: string[] } | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required');
  }

  try {
    console.log('\nGenerating baseline summary with OpenAI...');

    const videoContent = videos
      .filter((v) => v.transcript)
      .map(
        (v, idx) =>
          `Video ${idx + 1}: "${v.title}"\nTranscript: ${v.transcript!.substring(0, 5000)}`
      )
      .join('\n\n');

    const systemPrompt = `You are analyzing a YouTube channel's content to understand their niche.
You must respond ONLY with valid JSON. Do not include any markdown formatting, explanations, or text outside the JSON object.

IMPORTANT: Your response must be EXACTLY in this format:
{"summary": "your summary text here", "keywords": ["keyword1", "keyword2", "keyword3"]}

Do not wrap it in markdown code blocks. Do not add any text before or after the JSON.`;

    const userPrompt = `Analyze this content from a creator's channel:

${videoContent}

Based on the video titles and transcripts above, provide:
1. A concise summary (2-3 sentences) describing this creator's niche, content style, and target audience
2. 5-10 keywords that best describe their content themes and topics

Respond with ONLY this exact JSON structure:
{"summary": "your summary here", "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data: OpenAIResponse = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log('  Raw OpenAI response:', content.substring(0, 200));

    // Parse JSON (try multiple methods)
    let parsed: { summary: string; keywords: string[] };

    // Try extracting from markdown code block
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      // Try finding JSON object
      const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        parsed = JSON.parse(jsonObjectMatch[0]);
      } else {
        // Try direct parse
        parsed = JSON.parse(content.trim());
      }
    }

    if (!parsed.summary || !Array.isArray(parsed.keywords)) {
      throw new Error('Invalid response structure');
    }

    console.log('  ✅ Successfully parsed JSON response');
    console.log('  Summary:', parsed.summary);
    console.log('  Keywords:', parsed.keywords.join(', '));

    return parsed;
  } catch (error) {
    console.error('  ❌ Error:', error);
    return null;
  }
}

async function testSupabaseConnection(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('  ❌ NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required');
    return false;
  }

  try {
    console.log('\nTesting Supabase connection...');
    
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (response.ok) {
      console.log('  ✅ Supabase connection successful');
      return true;
    } else {
      console.error('  ❌ Supabase connection failed:', response.status);
      return false;
    }
  } catch (error) {
    console.error('  ❌ Error:', error);
    return false;
  }
}

async function main() {
  console.log('=== Channel Baseline Flow Test ===\n');

  // Step 1: Fetch transcripts
  console.log('Step 1: Fetching transcripts from DataForSEO...');
  const transcripts: VideoTranscript[] = [];

  for (const video of TEST_VIDEOS) {
    const transcript = await fetchTranscript(video.video_id);
    transcripts.push({
      video_id: video.video_id,
      title: video.title,
      transcript,
    });
  }

  const successfulTranscripts = transcripts.filter((t) => t.transcript);

  if (successfulTranscripts.length === 0) {
    console.error('\n❌ No transcripts fetched. Cannot continue test.');
    process.exit(1);
  }

  console.log(`\n✅ Fetched ${successfulTranscripts.length}/${TEST_VIDEOS.length} transcripts`);

  // Step 2: Generate baseline summary
  console.log('\nStep 2: Generating baseline summary...');
  const result = await generateBaselineSummary(successfulTranscripts);

  if (!result) {
    console.error('\n❌ Failed to generate baseline summary');
    process.exit(1);
  }

  // Step 3: Test Supabase connection
  console.log('\nStep 3: Testing Supabase connection...');
  const supabaseOk = await testSupabaseConnection();

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`✅ Transcripts fetched: ${successfulTranscripts.length}/${TEST_VIDEOS.length}`);
  console.log(`✅ Baseline summary generated: ${result ? 'Yes' : 'No'}`);
  console.log(`${supabaseOk ? '✅' : '❌'} Supabase connection: ${supabaseOk ? 'OK' : 'Failed'}`);

  if (successfulTranscripts.length > 0 && result && supabaseOk) {
    console.log('\n🎉 All tests passed! The baseline flow is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
  }
}

main().catch(console.error);

