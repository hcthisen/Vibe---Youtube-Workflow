/**
 * Nano Banana Pro Client (via Google AI Studio)
 * 
 * Uses Google's Gemini API for image generation
 */

interface GenerateThumbnailsParams {
  referenceImageUrl: string;
  headshotUrl: string; // Single best-matching headshot
  userName?: string; // User's name for personalization
  title: string;
  promptAdditions?: string;
  textModifications?: string; // Optional text changes
  ideaBrief?: string; // Optional idea brief for context
  count: number;
}

interface IterateThumbnailParams {
  previousImageUrl: string;
  headshotUrl?: string; // Optional: swap to different headshot
  userName?: string;
  refinementPrompt: string;
  textModifications?: string; // Optional text changes
  ideaBrief?: string; // Optional idea brief for context
  title: string;
  count: number;
}

interface GenerateResult {
  success: boolean;
  images: string[]; // base64 encoded images
  error?: string;
}

interface ImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

interface TextPart {
  text: string;
}

type ContentPart = TextPart | ImagePart;

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

  /**
   * Extract YouTube video ID from various URL formats
   */
  private extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Convert YouTube video URL to thumbnail URL
   */
  private convertYouTubeUrlToThumbnail(url: string): string {
    const videoId = this.extractYouTubeVideoId(url);
    if (videoId) {
      // Try high quality thumbnail first
      return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    }
    return url; // Return original URL if not a YouTube video
  }

  /**
   * Fetch an image from a URL and convert to base64
   */
  private async fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
    try {
      // Auto-convert YouTube video URLs to thumbnail URLs
      const imageUrl = this.convertYouTubeUrlToThumbnail(url);
      if (imageUrl !== url) {
        console.log(`Converted YouTube video URL to thumbnail: ${imageUrl}`);
      }
      
      console.log(`Fetching image from: ${imageUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ThumbnailGenerator/1.0)',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`Failed to fetch image from ${imageUrl}: ${response.status} ${response.statusText}`);
        
        // If maxresdefault failed, try hqdefault
        if (imageUrl.includes('maxresdefault.jpg')) {
          console.log(`Trying fallback thumbnail quality...`);
          const fallbackUrl = imageUrl.replace('maxresdefault.jpg', 'hqdefault.jpg');
          return this.fetchImageAsBase64(fallbackUrl);
        }
        
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      
      // Validate that we actually got image data
      if (arrayBuffer.byteLength === 0) {
        console.error(`Empty response from ${url}`);
        return null;
      }

      // Check file size (Gemini has limits, typically ~20MB per image)
      const sizeMB = arrayBuffer.byteLength / (1024 * 1024);
      console.log(`Fetched image: ${arrayBuffer.byteLength} bytes (${sizeMB.toFixed(2)} MB)`);
      
      if (sizeMB > 20) {
        console.error(`Image too large: ${sizeMB.toFixed(2)} MB (max 20 MB)`);
        return null;
      }
      
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      
      // Validate base64 encoding
      if (!base64 || base64.length === 0) {
        console.error(`Failed to encode image to base64`);
        return null;
      }
      
      // Determine MIME type from content-type header
      let mimeType = response.headers.get('content-type') || '';
      
      // Validate and normalize MIME type
      if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) {
        mimeType = 'image/jpeg';
      } else if (mimeType.includes('image/png')) {
        mimeType = 'image/png';
      } else if (mimeType.includes('image/webp')) {
        mimeType = 'image/webp';
      } else {
        // Fallback based on URL extension
        const lowerUrl = imageUrl.toLowerCase();
        if (lowerUrl.includes('.png') || lowerUrl.includes('png')) {
          mimeType = 'image/png';
        } else if (lowerUrl.includes('.webp') || lowerUrl.includes('webp')) {
          mimeType = 'image/webp';
        } else if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('jpg') || lowerUrl.includes('jpeg')) {
          mimeType = 'image/jpeg';
        } else {
          mimeType = 'image/jpeg'; // Default to JPEG
        }
      }

      console.log(`Image MIME type: ${mimeType}, base64 length: ${base64.length}`);

      return { data: base64, mimeType };
    } catch (error) {
      console.error(`Error fetching image from ${url}:`, error);
      return null;
    }
  }

  /**
   * Generate images using the Gemini API
   */
  private async generateImages(
    prompt: string,
    referenceImages: string[] = [],
    count: number = 1
  ): Promise<GenerateResult> {
    try {
      // Build the parts array
      const parts: ContentPart[] = [];

      // Add reference images first
      console.log(`Fetching ${referenceImages.length} reference images...`);
      for (let i = 0; i < referenceImages.length; i++) {
        const imageUrl = referenceImages[i];
        console.log(`Fetching image ${i + 1}/${referenceImages.length}: ${imageUrl}`);
        
        const imageData = await this.fetchImageAsBase64(imageUrl);
        if (imageData) {
          console.log(`Successfully fetched image ${i + 1}, MIME: ${imageData.mimeType}, size: ${imageData.data.length} chars`);
          parts.push({
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.data,
            },
          });
        } else {
          console.error(`Failed to fetch image ${i + 1}: ${imageUrl}`);
          throw new Error(`Failed to fetch image from ${imageUrl}. Please check the URL and try again.`);
        }
      }

      // Validate we have the expected images
      if (parts.length !== referenceImages.length) {
        throw new Error(`Failed to fetch all images. Expected ${referenceImages.length}, got ${parts.length}`);
      }

      // Add text prompt
      parts.push({ text: prompt });
      
      console.log(`Total parts to send: ${parts.length} (${parts.length - 1} images + 1 text prompt)`);

      // Determine image size based on model
      const imageSize = this.model === "gemini-3-pro-image-preview" ? "2K" : undefined;

      // Build request body
      const requestBody: any = {
        contents: [{
          role: "user",
          parts,
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      };

      // Add imageSize only for gemini-3-pro-image-preview
      if (imageSize) {
        requestBody.generationConfig.imageConfig.imageSize = imageSize;
      }

      console.log(`Sending request to Gemini (${this.model})...`);

      // Make API request
      const response = await fetch(
        `${this.endpoint}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(`Gemini API error response:`, error);
        throw new Error(`Gemini API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      console.log(`Gemini API response received`);

      // Extract base64 images from response
      const images: string[] = [];
      
      if (data.candidates && data.candidates[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            images.push(part.inlineData.data);
            console.log(`Extracted image from response`);
          }
        }
      }

      // For Gemini 2.5 Flash Image, we can only generate 1 image at a time
      // For multiple images, we need to make multiple requests
      if (count > 1 && images.length === 1) {
        console.log(`Generating ${count - 1} additional images...`);
        
        // Make additional requests for remaining images
        for (let i = 1; i < count; i++) {
          console.log(`Generating image ${i + 1}/${count}...`);
          
          const additionalResponse = await fetch(
            `${this.endpoint}/models/${this.model}:generateContent?key=${this.apiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            }
          );

          if (additionalResponse.ok) {
            const additionalData = await additionalResponse.json();
            if (additionalData.candidates && additionalData.candidates[0]?.content?.parts) {
              for (const part of additionalData.candidates[0].content.parts) {
                if (part.inlineData?.data) {
                  images.push(part.inlineData.data);
                  console.log(`Generated additional image ${i + 1}`);
                }
              }
            }
          } else {
            console.error(`Failed to generate additional image ${i + 1}`);
          }
        }
      }

      if (images.length === 0) {
        throw new Error("No images returned from API");
      }

      console.log(`Successfully generated ${images.length} images`);

      return {
        success: true,
        images,
      };
    } catch (error) {
      console.error(`Image generation error:`, error);
      return {
        success: false,
        images: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateThumbnails(params: GenerateThumbnailsParams): Promise<GenerateResult> {
    const prompt = this.buildFaceSwapPrompt(params);
    
    // Send headshot first, then reference thumbnail
    // This follows the pattern from recreate_thumbnails.py
    const images: string[] = [params.headshotUrl, params.referenceImageUrl];
    
    return this.generateImages(prompt, images, params.count);
  }

  async iterateThumbnail(params: IterateThumbnailParams): Promise<GenerateResult> {
    const userName = params.userName || "the person";
    
    // If headshot is provided, do a face swap iteration
    // Otherwise, just refine the existing thumbnail
    const images: string[] = params.headshotUrl 
      ? [params.headshotUrl, params.previousImageUrl]
      : [params.previousImageUrl];
    
    let prompt = params.headshotUrl
      ? `IMAGE 1: Reference photo of ${userName}'s face.
IMAGE 2: The thumbnail to edit.

TASK: Replace the face in the thumbnail with ${userName}'s exact face from IMAGE 1.

${params.refinementPrompt}

${params.textModifications ? `Text changes: ${params.textModifications}` : 'Keep all text exactly as shown.'}`
      : `Refine this YouTube thumbnail based on the following instructions:

${params.refinementPrompt}

Video title: "${params.title}"

${params.textModifications ? `Text changes: ${params.textModifications}` : 'Keep all text exactly as shown.'}

Style: Professional YouTube thumbnail with bold, attention-grabbing elements.
Format: 16:9 aspect ratio.

Make ONLY the requested changes while keeping the overall composition similar.`;

    if (params.ideaBrief) {
      prompt += `\n\nIdea Brief: ${params.ideaBrief}
When adding or modifying text on the thumbnail, ensure it aligns with the core concepts and message from this idea brief.`;
    }

    prompt += `\n\nOutput in 16:9 format.`;
    
    return this.generateImages(prompt, images, params.count);
  }

  private buildFaceSwapPrompt(params: GenerateThumbnailsParams): string {
    const userName = params.userName || "the person";
    
    let prompt = `IMAGE 1: Reference photo of ${userName}'s face.
IMAGE 2: The thumbnail to edit.

TASK: Replace ONLY the face in the thumbnail with ${userName}'s exact face from IMAGE 1.

Keep the composition, background, colors, and layout identical to IMAGE 2.

${params.textModifications ? `Text changes: ${params.textModifications}` : 'Keep all text exactly as shown in IMAGE 2.'}

Video title context: "${params.title}"`;

    if (params.ideaBrief) {
      prompt += `\n\nIdea Brief: ${params.ideaBrief}
When adding or modifying text on the thumbnail, ensure it aligns with the core concepts and message from this idea brief.`;
    }

    prompt += `\n\nOutput in 16:9 format.`;

    if (params.promptAdditions) {
      prompt += `\n\nAdditional requirements: ${params.promptAdditions}`;
    }

    return prompt;
  }
}

let _nanoBananaClient: NanoBananaClient | null = null;

/**
 * Lazily create the Nano Banana (Google AI Studio) client.
 *
 * This avoids throwing during `next build` / module import when env vars are not
 * present at build-time (common on platforms like Coolify).
 */
export function getNanoBananaClient(): NanoBananaClient {
  if (!_nanoBananaClient) {
    _nanoBananaClient = new NanoBananaClient();
  }
  return _nanoBananaClient;
}
