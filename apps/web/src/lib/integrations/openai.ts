/**
 * OpenAI API Client
 * 
 * Uses OpenAI for text generation (outlines, titles, ideas, summaries)
 */

interface GenerateIdeasParams {
  baselineContext: string;
  baselineKeywords: string[];
  avoidTopics: string[];
  targetViewer?: string;
  focusTopic?: string;
  count: number;
}

interface IdeaResult {
  title_concept: string;
  thesis: string;
  why_now: string;
  hook_options: string[];
  thumbnail_text_ideas: string[];
  search_queries_used: string[];
}

interface GenerateIdeasResult {
  success: boolean;
  ideas: IdeaResult[];
  error?: string;
}

interface GenerateOutlineParams {
  title: string;
  context: string;
  existingHooks: string[];
}

interface GenerateOutlineResult {
  success: boolean;
  outline: { markdown: string };
  error?: string;
}

interface GenerateTitlesParams {
  currentTitle: string;
  context: string;
  count: number;
}

interface TitleVariant {
  title: string;
  style: string;
  reasoning?: string;
}

interface GenerateTitlesResult {
  success: boolean;
  titles: TitleVariant[];
  error?: string;
}

interface GenerateSummaryParams {
  videos: Array<{
    title: string;
    transcript?: string;
  }>;
}

interface GenerateSummaryResult {
  success: boolean;
  summary: string;
  keywords: string[];
  error?: string;
}

interface GenerateYouTubeDescriptionParams {
  transcript: string;
}

interface GenerateYouTubeDescriptionResult {
  success: boolean;
  description: string;
  error?: string;
}

interface GenerateOutlierIdeaParams {
  title: string;
  channelName?: string | null;
  transcript?: string | null;
}

interface GenerateOutlierIdeaResult {
  success: boolean;
  summary: string;
  hook_options: string[];
  thumbnail_text_ideas: string[];
  error?: string;
}

interface GenerateAdaptedIdeaParams {
  baselineContext: string;
  baselineKeywords: string[];
  sourceTitle: string;
  sourceChannel?: string | null;
  transcript?: string | null;
}

interface GenerateAdaptedIdeaResult {
  success: boolean;
  title_concept: string;
  thesis: string;
  why_now: string;
  hook_options: string[];
  thumbnail_text_ideas: string[];
  error?: string;
}

class OpenAIClient {
  private baseUrl = "https://api.openai.com/v1";
  private apiKey: string;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required");
    }

    this.apiKey = apiKey;
    this.model = process.env.OPENAI_MODEL || "gpt-5.2";
  }

  private async chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      responseJsonSchema?: {
        name: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
    } = {}
  ): Promise<string> {
    const model = options.model || this.model;
    const isGPT5 = model.startsWith("gpt-5");

    if (isGPT5) {
      // Use new GPT-5 API (responses endpoint)
      const input = messages.map((msg) => ({
        role: msg.role === "system" ? "developer" : msg.role,
        content: [
          {
            type: "input_text",
            text: msg.content,
          },
        ],
      }));

      const response = await fetch(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input,
          temperature: options.temperature ?? 0.7,
          text: {
            format: {
              type: options.responseJsonSchema ? "json_schema" : "json_object",
              ...(options.responseJsonSchema
                ? {
                    name: options.responseJsonSchema.name,
                    schema: options.responseJsonSchema.schema,
                    strict: options.responseJsonSchema.strict ?? true,
                  }
                : {}),
            },
            verbosity: "low", // Minimize extra text
          },
          reasoning: {
            effort: "medium",
            summary: "auto",
          },
          max_output_tokens: options.maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (e) {
        const raw = await response.text().catch(() => "");
        const sample = raw.substring(0, 300).replace(/\n/g, " ");
        throw new Error(
          `Failed to parse JSON from OpenAI responses API. Response sample: ${sample}...`
        );
      }

      // Robustly extract text/json from the Responses API shape.
      // Prefer any explicit json payload if present, otherwise collect output_text.
      const outputItems: any[] = Array.isArray(data?.output) ? data.output : [];
      const contentItems: any[] = outputItems.flatMap((item) =>
        Array.isArray(item?.content) ? item.content : []
      );

      const firstJson = contentItems.find((c) => c && typeof c === "object" && c.json != null);
      if (firstJson?.json != null) {
        return JSON.stringify(firstJson.json);
      }

      const refusal = contentItems.find((c) => c && typeof c === "object" && typeof c.refusal === "string");
      if (refusal?.refusal) {
        throw new Error(`OpenAI refused the request: ${refusal.refusal}`);
      }

      const textParts = contentItems
        .map((c) => (c && typeof c === "object" ? c.text : null))
        .filter((t): t is string => typeof t === "string" && t.length > 0);

      if (textParts.length > 0) {
        return textParts.join("");
      }

      if (typeof data?.output_text === "string" && data.output_text.length > 0) {
        return data.output_text;
      }

      const debugSample = JSON.stringify(data).substring(0, 300);
      throw new Error(
        `OpenAI response did not contain any extractable text/json. Response sample: ${debugSample}...`
      );
    } else {
      // Use legacy GPT-4 API (chat completions endpoint)
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    }
  }

  private parseJsonResponse<T>(response: string): T {
    // Try to extract JSON from the response (markdown code blocks)
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        throw new Error(`Failed to parse JSON from code block: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
      }
    }

    // Try to find JSON object in the response (handles extra text before/after)
    const jsonObjectMatch = response.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch (e) {
        // Continue to next attempt
      }
    }

    // Try direct parse
    try {
      return JSON.parse(response.trim());
    } catch (e) {
      const extracted = this.extractJsonCandidate(response);
      if (extracted) {
        try {
          return JSON.parse(extracted);
        } catch (innerError) {
          // Continue to error below
        }
      }
      // Include a sample of the response to help debug
      const sample = (response || "[empty]").substring(0, 300).replace(/\n/g, " ");
      throw new Error(`Failed to parse JSON response from OpenAI. Response sample: ${sample}...`);
    }
  }

  private extractJsonCandidate(response: string): string | null {
    const text = response.trim();
    if (!text) return null;

    const startIndex = text.search(/[\[{]/);
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === "\\") {
          escape = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        depth += 1;
      } else if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, i + 1);
        }
      }
    }

    return null;
  }

  async generateIdeas(params: GenerateIdeasParams): Promise<GenerateIdeasResult> {
    try {
      const systemPrompt = `You are a YouTube content strategist helping a creator generate video ideas.
You must respond with valid JSON only.

The creator's niche context:
${params.baselineContext}

Keywords: ${params.baselineKeywords.join(", ")}

${params.avoidTopics.length > 0 ? `Topics to avoid: ${params.avoidTopics.join(", ")}` : ""}
${params.targetViewer ? `Target viewer: ${params.targetViewer}` : ""}`;

      const userPrompt = `Generate ${params.count} unique video ideas that would perform well based on the niche context.

${params.focusTopic ? `Focus topic: ${params.focusTopic}` : ""}

For each idea, provide:
- title_concept: A working title for the video
- thesis: The core argument or value proposition (1 sentence)
- why_now: Why this topic is relevant right now (1 sentence)
- hook_options: 3 different hook options (8-12 words each)
- thumbnail_text_ideas: 2-4 short text phrases (2-4 words each)
- search_queries_used: 2-3 short search queries

Respond with a JSON object: { "ideas": [...] }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          temperature: 0.8,
          maxTokens: Math.min(20000, Math.max(6000, params.count * 300)),
          responseJsonSchema: {
            name: "deep_research_ideas",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["ideas"],
              properties: {
                ideas: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "title_concept",
                      "thesis",
                      "why_now",
                      "hook_options",
                      "thumbnail_text_ideas",
                      "search_queries_used",
                    ],
                    properties: {
                      title_concept: { type: "string" },
                      thesis: { type: "string" },
                      why_now: { type: "string" },
                      hook_options: { type: "array", items: { type: "string" } },
                      thumbnail_text_ideas: { type: "array", items: { type: "string" } },
                      search_queries_used: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        }
      );

      let parsed: { ideas: IdeaResult[] };
      try {
        parsed = this.parseJsonResponse<{ ideas: IdeaResult[] }>(response);
      } catch (e) {
        // If we got truncated / invalid JSON, retry by splitting into smaller batches.
        // This is only used as a fallback for robustness.
        const message = e instanceof Error ? e.message : String(e);
        if (params.count > 3 && message.includes("Failed to parse JSON response from OpenAI")) {
          const leftCount = Math.ceil(params.count / 2);
          const rightCount = params.count - leftCount;

          const left = await this.generateIdeas({ ...params, count: leftCount });
          if (!left.success) return left;

          if (rightCount <= 0) {
            return { success: true, ideas: left.ideas };
          }

          const right = await this.generateIdeas({ ...params, count: rightCount });
          if (!right.success) return right;

          return { success: true, ideas: [...left.ideas, ...right.ideas] };
        }
        throw e;
      }

      return {
        success: true,
        ideas: parsed.ideas,
      };
    } catch (error) {
      return {
        success: false,
        ideas: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateOutline(params: GenerateOutlineParams): Promise<GenerateOutlineResult> {
    try {
      const systemPrompt = `You are a YouTube scriptwriter. Generate a High Level video outline.
You must respond with valid JSON only.`;

      const userPrompt = `Create a video outline for: "${params.title}"

Context:
${params.context}

${params.existingHooks.length > 0 ? `Existing hook ideas to consider: ${params.existingHooks.join(", ")}` : ""}

Use the Idea Brief section (if present in the context) as your primary source of truth.

The outline should follow this exact format:
2-3 Different opening hooks
Bullet pointed list of things to cover

Example Format:
# Hooks
Hook Option 1: [Hook text]
Hook Option 2: [Hook text]
Hook Option 3: [Hook text]

# Outline
- [Point 1]
- [Point 2]
- [Point 3]
...

Respond with JSON: { "markdown": "your markdown string here" }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.7 }
      );

      const parsed = this.parseJsonResponse<{ markdown: string }>(response);

      return {
        success: true,
        outline: { markdown: parsed.markdown || "" },
      };
    } catch (error) {
      return {
        success: false,
        outline: { markdown: "" },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateTitles(params: GenerateTitlesParams): Promise<GenerateTitlesResult> {
    try {
      const systemPrompt = `You are a YouTube title expert. Generate compelling, click-worthy titles.
You must respond with valid JSON only.`;

      const userPrompt = `Generate ${params.count} title variants for a video about:
"${params.currentTitle}"

Context: ${params.context}

Create diverse titles across these styles:
- question: Titles that ask a question
- statement: Bold declarative titles
- how-to: Educational/tutorial style
- story: Narrative hook titles
- listicle: Number-based titles
- curiosity: Mystery/intrigue titles

For each title provide:
- title: The title text (max 60 chars)
- style: One of the styles above
- reasoning: Brief explanation of why it works

Respond with JSON: { "title_variants": [...] }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.8 }
      );

      const parsed = this.parseJsonResponse<{ title_variants: TitleVariant[] }>(response);

      return {
        success: true,
        titles: parsed.title_variants,
      };
    } catch (error) {
      return {
        success: false,
        titles: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateBaselineSummary(params: GenerateSummaryParams): Promise<GenerateSummaryResult> {
    try {
      const systemPrompt = `You are analyzing a YouTube channel's content to understand their niche.
You must respond ONLY with valid JSON. Do not include any markdown formatting, explanations, or text outside the JSON object.

IMPORTANT: Your response must be EXACTLY in this format:
{"summary": "your summary text here", "keywords": ["keyword1", "keyword2", "keyword3"]}

Do not wrap it in markdown code blocks. Do not add any text before or after the JSON.`;

      // Build video content for analysis (transcripts if available, otherwise titles)
      const videoContent = params.videos
        .map((v, idx) => {
          if (v.transcript) {
            return `Video ${idx + 1}: "${v.title}"\nTranscript: ${v.transcript}`;
          } else {
            return `Video ${idx + 1}: "${v.title}"`;
          }
        })
        .join("\n\n");

      const userPrompt = `Analyze this content from a creator's channel:

${videoContent}

Based on the video titles and transcripts above, provide:
1. A concise summary (2-3 sentences) describing this creator's niche, content style, and target audience
2. 5-10 keywords that best describe their content themes and topics

Respond with ONLY this exact JSON structure:
{"summary": "your summary here", "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]}`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.3, maxTokens: 1200 }
      );

      const parsed = this.parseJsonResponse<{ summary: string; keywords: string[] }>(response);

      // Validate the parsed response
      if (!parsed.summary || !Array.isArray(parsed.keywords)) {
        throw new Error("Invalid response structure: missing summary or keywords");
      }

      return {
        success: true,
        summary: parsed.summary,
        keywords: parsed.keywords,
      };
    } catch (error) {
      return {
        success: false,
        summary: "",
        keywords: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateYouTubeDescription(
    params: GenerateYouTubeDescriptionParams
  ): Promise<GenerateYouTubeDescriptionResult> {
    try {
      const systemPrompt = `You are a YouTube copywriter. Write a short, natural description based on the transcript.
You must respond with valid JSON only.`;

      const userPrompt = `Write a concise YouTube description based on this transcript.

Constraints:
- 3-5 short paragraphs
- Keep it punchy and personal
- Do not add hashtags
- Do not invent links or credits unless explicitly stated in the transcript

Transcript:
${params.transcript}

Respond with JSON: { "description": "..." }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.6, maxTokens: 1200 }
      );

      const parsed = this.parseJsonResponse<{ description: string }>(response);

      return {
        success: true,
        description: parsed.description || "",
      };
    } catch (error) {
      return {
        success: false,
        description: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateOutlierIdeaDetails(
    params: GenerateOutlierIdeaParams
  ): Promise<GenerateOutlierIdeaResult> {
    try {
      const systemPrompt = `You are a YouTube strategist. Turn a source video into a new idea the creator could make.
You must respond with valid JSON only.`;

      const userPrompt = `Write a short idea summary (1-2 sentences) of what the creator could/should make based on this source video.

Source title: ${params.title}
${params.channelName ? `Channel: ${params.channelName}` : ""}

Transcript (if available):
${params.transcript || "Transcript not available."}

Return:
- summary: 1-2 sentence idea summary, written in the creator's voice ("I" statements)
- hook_options: 3 punchy hook options
- thumbnail_text_ideas: 3-5 short thumbnail text ideas (2-4 words each)

Respond with JSON: { "summary": "...", "hook_options": [...], "thumbnail_text_ideas": [...] }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.7, maxTokens: 1200 }
      );

      const parsed = this.parseJsonResponse<{
        summary: string;
        hook_options: string[];
        thumbnail_text_ideas: string[];
      }>(response);

      return {
        success: true,
        summary: parsed.summary || "",
        hook_options: parsed.hook_options || [],
        thumbnail_text_ideas: parsed.thumbnail_text_ideas || [],
      };
    } catch (error) {
      return {
        success: false,
        summary: "",
        hook_options: [],
        thumbnail_text_ideas: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateAdaptedIdeaFromSource(
    params: GenerateAdaptedIdeaParams
  ): Promise<GenerateAdaptedIdeaResult> {
    try {
      const systemPrompt = `You are a YouTube strategist. Adapt a trending source video into a new idea that fits the creator's niche.
You must respond with valid JSON only.`;

      const userPrompt = `Creator baseline:
${params.baselineContext}

Keywords: ${params.baselineKeywords.join(", ")}

Source video title: ${params.sourceTitle}
${params.sourceChannel ? `Source channel: ${params.sourceChannel}` : ""}

Transcript excerpt (may be truncated):
${params.transcript || "Transcript not available."}

Write an adapted idea that fits THIS creator's niche (not a copy of the source).
Use first-person ("I") phrasing so it feels like the creator's plan.

Return:
- title_concept: A strong, creator-fit title
- thesis: 1 sentence summary of what I will make
- why_now: 1 sentence on why this is timely for my audience
- hook_options: 3 hook lines (8-12 words each)
- thumbnail_text_ideas: 3-5 short phrases (2-4 words each)

Respond with JSON: { "title_concept": "...", "thesis": "...", "why_now": "...", "hook_options": [...], "thumbnail_text_ideas": [...] }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          temperature: 0.7,
          maxTokens: 2000,
          responseJsonSchema: {
            name: "adapted_idea",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["title_concept", "thesis", "why_now", "hook_options", "thumbnail_text_ideas"],
              properties: {
                title_concept: { type: "string" },
                thesis: { type: "string" },
                why_now: { type: "string" },
                hook_options: { type: "array", items: { type: "string" } },
                thumbnail_text_ideas: { type: "array", items: { type: "string" } },
              },
            },
          },
        }
      );

      const parsed = this.parseJsonResponse<{
        title_concept: string;
        thesis: string;
        why_now: string;
        hook_options: string[];
        thumbnail_text_ideas: string[];
      }>(response);

      return {
        success: true,
        title_concept: parsed.title_concept || "",
        thesis: parsed.thesis || "",
        why_now: parsed.why_now || "",
        hook_options: parsed.hook_options || [],
        thumbnail_text_ideas: parsed.thumbnail_text_ideas || [],
      };
    } catch (error) {
      return {
        success: false,
        title_concept: "",
        thesis: "",
        why_now: "",
        hook_options: [],
        thumbnail_text_ideas: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

let _openaiClient: OpenAIClient | null = null;

/**
 * Lazily create the OpenAI client.
 *
 * This avoids throwing during `next build` / module import when env vars are not
 * present at build-time (common on platforms like Coolify).
 */
export function getOpenAIClient(): OpenAIClient {
  if (!_openaiClient) {
    _openaiClient = new OpenAIClient();
  }
  return _openaiClient;
}

