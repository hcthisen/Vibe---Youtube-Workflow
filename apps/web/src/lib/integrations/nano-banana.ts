/**
 * Nano Banana Pro Client (via Google AI Studio)
 * 
 * Uses Google's Imagen API for thumbnail generation
 */

interface GenerateThumbnailsParams {
  referenceImageUrl: string;
  headshotUrls: string[];
  title: string;
  promptAdditions?: string;
  count: number;
}

interface IterateThumbnailParams {
  previousImageUrl: string;
  refinementPrompt: string;
  title: string;
  count: number;
}

interface GenerateResult {
  success: boolean;
  images: string[]; // base64 encoded images
  error?: string;
}

class NanoBananaClient {
  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_STUDIO_API_KEY is required");
    }

    this.apiKey = apiKey;
    this.endpoint = process.env.NANO_BANANA_ENDPOINT || "https://generativelanguage.googleapis.com/v1beta";
    this.model = process.env.NANO_BANANA_MODEL || "gemini-3-pro-image-preview";
  }

  private async generateImages(prompt: string, count: number): Promise<GenerateResult> {
    try {
      const response = await fetch(
        `${this.endpoint}/models/${this.model}:predict?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: count,
              aspectRatio: "16:9", // YouTube thumbnail aspect ratio
              safetyFilterLevel: "block_only_high",
              personGeneration: "allow_all",
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Imagen API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      
      // Extract base64 images from response
      const images: string[] = [];
      for (const prediction of data.predictions || []) {
        if (prediction.bytesBase64Encoded) {
          images.push(prediction.bytesBase64Encoded);
        }
      }

      return {
        success: true,
        images,
      };
    } catch (error) {
      return {
        success: false,
        images: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateThumbnails(params: GenerateThumbnailsParams): Promise<GenerateResult> {
    // Build the prompt
    const prompt = this.buildThumbnailPrompt(params);
    return this.generateImages(prompt, params.count);
  }

  async iterateThumbnail(params: IterateThumbnailParams): Promise<GenerateResult> {
    const prompt = `Create a YouTube thumbnail variation based on this refinement request:

${params.refinementPrompt}

Video title: "${params.title}"

Style: Professional YouTube thumbnail with bold, attention-grabbing elements.
Format: 16:9 aspect ratio, high contrast, readable text, expressive face.`;

    return this.generateImages(prompt, params.count);
  }

  private buildThumbnailPrompt(params: GenerateThumbnailsParams): string {
    let prompt = `Create a professional YouTube thumbnail for a video titled "${params.title}".

The thumbnail should:
- Be eye-catching with high contrast colors
- Include a clear, expressive human face (based on the reference)
- Have bold, readable text overlay if text is included
- Use the 16:9 aspect ratio standard for YouTube
- Convey emotion and energy

Reference style: Match the composition and energy of successful YouTube thumbnails.`;

    if (params.promptAdditions) {
      prompt += `\n\nAdditional requirements: ${params.promptAdditions}`;
    }

    return prompt;
  }
}

// Singleton instance
export const nanoBananaClient = new NanoBananaClient();

