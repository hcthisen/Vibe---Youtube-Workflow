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

interface OutlineSection {
  title: string;
  beats: string[];
  duration_estimate_seconds?: number;
}

interface OutlineResult {
  intro: OutlineSection;
  sections: OutlineSection[];
  outro: OutlineSection;
}

interface GenerateOutlineResult {
  success: boolean;
  outline: OutlineResult;
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

class OpenAIClient {
  private baseUrl = "https://api.openai.com/v1";
  private apiKey: string;
  private defaultModel: string;
  private fastModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required");
    }

    this.apiKey = apiKey;
    this.defaultModel = process.env.OPENAI_MODEL_DEFAULT || "gpt-5.2";
    this.fastModel = process.env.OPENAI_MODEL_FAST || "gpt-5-mini";
  }

  private async chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const model = options.model || this.defaultModel;
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
          text: {
            format: {
              type: "json_object", // Request JSON output
            },
            verbosity: "low", // Minimize extra text
          },
          reasoning: {
            effort: "low", // Fast reasoning for simple tasks
            summary: "auto", // Auto-select reasoning summary (concise, detailed, or auto)
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      return data.output?.[0]?.content?.[0]?.text || "";
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

    // Try direct parse
    try {
      return JSON.parse(response);
    } catch (e) {
      // Include a sample of the response to help debug
      const sample = response.substring(0, 200);
      throw new Error(`Failed to parse JSON response from OpenAI. Response sample: ${sample}...`);
    }
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

For each idea, provide:
- title_concept: A working title for the video
- thesis: The core argument or value proposition (1-2 sentences)
- why_now: Why this topic is relevant right now
- hook_options: 3 different hook options to start the video
- thumbnail_text_ideas: 2-3 short text phrases for thumbnail
- search_queries_used: What queries led to this idea

Respond with a JSON object: { "ideas": [...] }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.8 }
      );

      const parsed = this.parseJsonResponse<{ ideas: IdeaResult[] }>(response);

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
      const systemPrompt = `You are a YouTube scriptwriter. Generate a detailed video outline.
You must respond with valid JSON only.`;

      const userPrompt = `Create a video outline for: "${params.title}"

Context: ${params.context}

${params.existingHooks.length > 0 ? `Existing hook ideas to consider: ${params.existingHooks.join(", ")}` : ""}

The outline should include:
- intro: Opening hook and setup (30-60 seconds)
- sections: 3-5 main content sections with beats
- outro: Conclusion and call-to-action

For each section provide:
- title: Section name
- beats: Array of key points to cover
- duration_estimate_seconds: Estimated duration

Respond with JSON: { "intro": {...}, "sections": [...], "outro": {...} }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.7 }
      );

      const parsed = this.parseJsonResponse<OutlineResult>(response);

      return {
        success: true,
        outline: parsed,
      };
    } catch (error) {
      return {
        success: false,
        outline: { intro: { title: "", beats: [] }, sections: [], outro: { title: "", beats: [] } },
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
        { model: this.fastModel, temperature: 0.8 }
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
You must respond ONLY with valid JSON. Do not include any markdown formatting, explanations, or text outside the JSON object.`;

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

Your response must be ONLY this JSON format (no markdown, no extra text):
{ "summary": "...", "keywords": ["keyword1", "keyword2", ...] }`;

      const response = await this.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { model: this.fastModel, temperature: 0.3 }
      );

      const parsed = this.parseJsonResponse<{ summary: string; keywords: string[] }>(response);

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
}

// Singleton instance
export const openaiClient = new OpenAIClient();

