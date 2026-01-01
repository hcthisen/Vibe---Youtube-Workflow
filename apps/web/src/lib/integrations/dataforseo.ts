/**
 * DataForSEO API Client
 * 
 * Documentation: https://docs.dataforseo.com/v3/serp/youtube/
 */

interface VideoResult {
  youtube_video_id: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string | null;
  views_count: number | null;
  channel_name: string | null;
  raw_payload?: Record<string, unknown>;
}

interface GetChannelVideosResult {
  success: boolean;
  videos: VideoResult[];
  channel_name: string | null;
  error?: string;
}

interface SearchVideosParams {
  keywords: string[];
  limit?: number;
  language_code?: string;
  location_code?: number;
}

interface SearchVideosResult {
  success: boolean;
  videos: VideoResult[];
  error?: string;
}

interface GetSubtitlesResult {
  success: boolean;
  transcript: string | null;
  language: string | null;
  error?: string;
}

class DataForSEOClient {
  private baseUrl = "https://api.dataforseo.com/v3";
  private auth: string;

  constructor() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dataforseo.ts:50',message:'DataForSEO constructor called',data:{hasLogin:!!process.env.DATAFORSEO_LOGIN,hasPassword:!!process.env.DATAFORSEO_PASSWORD,allEnvKeys:Object.keys(process.env).filter(k=>k.includes('DATA'))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,D'})}).catch(()=>{});
    // #endregion
    
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;

    if (!login || !password) {
      throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required");
    }

    this.auth = Buffer.from(`${login}:${password}`).toString("base64");
  }

  private async request<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: data ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${this.auth}`,
        "Content-Type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`DataForSEO API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Extracts channel name from various input formats:
   * - @channelname -> channelname
   * - channelname -> channelname
   * - https://www.youtube.com/@channelname -> channelname
   * - https://www.youtube.com/channel/UC... -> returns as-is (channel ID)
   */
  private extractChannelName(input: string): string {
    let channelName = input.trim();

    // Extract from YouTube URL
    if (channelName.includes("youtube.com")) {
      // Handle @username format: https://www.youtube.com/@channelname
      const atMatch = channelName.match(/youtube\.com\/@([^/?]+)/);
      if (atMatch) {
        return atMatch[1];
      }
      // Handle channel ID format: https://www.youtube.com/channel/UC...
      const channelMatch = channelName.match(/youtube\.com\/channel\/([^/?]+)/);
      if (channelMatch) {
        return channelMatch[1];
      }
      // Handle user format: https://www.youtube.com/user/username
      const userMatch = channelName.match(/youtube\.com\/user\/([^/?]+)/);
      if (userMatch) {
        return userMatch[1];
      }
    }

    // Strip @ prefix if present
    if (channelName.startsWith("@")) {
      channelName = channelName.slice(1);
    }

    return channelName;
  }

  async getChannelVideos(channelIdentifier: string, limit: number = 20): Promise<GetChannelVideosResult> {
    try {
      // Extract channel name from input (handles @channelname, channelname, or full URLs)
      const channelName = this.extractChannelName(channelIdentifier);

      if (!channelName) {
        return {
          success: false,
          videos: [],
          channel_name: null,
          error: "Invalid channel identifier. Please provide a channel name (e.g., @channelname) or channel URL.",
        };
      }

      // Use the live advanced endpoint
      const searchResult = await this.request<{
        status_code: number;
        // Live endpoint can return either a direct `result` array or be wrapped in `tasks[0].result`
        result?: Array<{
          items?: Array<{
            type: string;
            video_id?: string;
            title?: string;
            url?: string;
            thumbnail_url?: string;
            timestamp?: string;
            publication_date?: string;
            views_count?: number;
            channel_name?: string;
            is_shorts?: boolean;
          }>;
        }>;
        tasks?: Array<{
          status_code?: number;
          status_message?: string;
          result?: Array<{
            items?: Array<{
              type: string;
              video_id?: string;
              title?: string;
              url?: string;
              thumbnail_url?: string;
              timestamp?: string;
              publication_date?: string;
              views_count?: number;
              channel_name?: string;
              is_shorts?: boolean;
            }>;
          }>;
        }>;
      }>("/serp/youtube/organic/live/advanced", [
        {
          keyword: channelName,
          location_code: 2840, // USA
          language_code: "en",
          device: "desktop",
          os: "windows",
          block_depth: Math.min(200, Math.max(40, limit * 10)), // Fetch 10x limit to account for Shorts/dupes filtering
        },
      ]);

      // Check if API returned an error status
      if (searchResult.status_code !== 20000) {
        return {
          success: false,
          videos: [],
          channel_name: null,
          error: `API returned status code: ${searchResult.status_code}`,
        };
      }

      // Extract items:
      // - Some environments return `tasks[0].result[0].items` (task-wrapped)
      // - Others may return `result[0].items` (direct)
      const items =
        searchResult.result?.[0]?.items ??
        searchResult.tasks?.[0]?.result?.[0]?.items ??
        [];

      // Filter for video items only (exclude channels and playlists)
      const videoItems = items.filter((item) => item.type === "youtube_video");

      // Exclude Shorts and ensure unique video IDs (prevents React duplicate key crashes)
      const nonShortVideoItems = videoItems.filter(
        (item) => item.is_shorts !== true && !item.url?.includes("/shorts/")
      );

      const uniqueVideoItems: typeof nonShortVideoItems = [];
      const seenVideoIds = new Set<string>();
      for (const item of nonShortVideoItems) {
        const id = item.video_id;
        if (!id) continue;
        if (seenVideoIds.has(id)) continue;
        seenVideoIds.add(id);
        uniqueVideoItems.push(item);
      }

      if (uniqueVideoItems.length === 0) {
        return {
          success: false,
          videos: [],
          channel_name: null,
          error: `No videos found for channel: ${channelName}`,
        };
      }

      // Map to VideoResult format
      const videos: VideoResult[] = uniqueVideoItems
        .slice(0, limit) // Videos are already sorted by date (newest first)
        .map((item) => ({
          youtube_video_id: item.video_id || "",
          title: item.title || "",
          thumbnail_url: item.thumbnail_url || null,
          published_at: item.timestamp || item.publication_date || null,
          views_count: item.views_count || null,
          channel_name: item.channel_name || null,
          raw_payload: item,
        }));

      // Extract channel name from first video result
      const channelNameFromResult = videos[0]?.channel_name || null;

      return {
        success: true,
        videos,
        channel_name: channelNameFromResult,
      };
    } catch (error) {
      return {
        success: false,
        videos: [],
        channel_name: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async searchVideos(params: SearchVideosParams): Promise<SearchVideosResult> {
    try {
      // Use live/advanced endpoint for immediate results (same as getChannelVideos)
      const searchResult = await this.request<{
        status_code: number;
        // Live endpoint can return either a direct `result` array or be wrapped in `tasks[0].result`
        result?: Array<{
          items?: Array<{
            type: string;
            video_id?: string;
            title?: string;
            url?: string;
            thumbnail_url?: string;
            timestamp?: string;
            publication_date?: string;
            views_count?: number;
            channel_name?: string;
            is_shorts?: boolean;
          }>;
        }>;
        tasks?: Array<{
          status_code?: number;
          status_message?: string;
          result?: Array<{
            items?: Array<{
              type: string;
              video_id?: string;
              title?: string;
              url?: string;
              thumbnail_url?: string;
              timestamp?: string;
              publication_date?: string;
              views_count?: number;
              channel_name?: string;
              is_shorts?: boolean;
            }>;
          }>;
        }>;
      }>("/serp/youtube/organic/live/advanced", [
        {
          keyword: params.keywords.join(" "),
          location_code: params.location_code || 2840, // USA
          language_code: params.language_code || "en",
          device: "desktop",
          os: "windows",
          block_depth: params.limit || 50, // Use block_depth, not depth
        },
      ]);

      // Check if API returned an error status
      if (searchResult.status_code !== 20000) {
        return {
          success: false,
          videos: [],
          error: `API returned status code: ${searchResult.status_code}`,
        };
      }

      // DataForSEO can return top-level OK while the task itself failed.
      // Example: status_code 20000, but tasks[0].status_code 40501 ("Invalid Field: 'depth'")
      const taskStatusCode = searchResult.tasks?.[0]?.status_code;
      const taskStatusMessage = searchResult.tasks?.[0]?.status_message;
      if (typeof taskStatusCode === "number" && taskStatusCode !== 20000) {
        return {
          success: false,
          videos: [],
          error: `DataForSEO task error: ${taskStatusCode}${taskStatusMessage ? ` (${taskStatusMessage})` : ""}`,
        };
      }

      // Extract items from response (handle both direct result and task-wrapped formats)
      const items =
        searchResult.result?.[0]?.items ??
        searchResult.tasks?.[0]?.result?.[0]?.items ??
        [];

      // Filter for video items only (exclude channels and playlists)
      const videoItems = items.filter((item) => item.type === "youtube_video");

      // Exclude Shorts and ensure unique video IDs
      const nonShortVideoItems = videoItems.filter(
        (item) => item.is_shorts !== true && !item.url?.includes("/shorts/")
      );

      const uniqueVideoItems: typeof nonShortVideoItems = [];
      const seenVideoIds = new Set<string>();
      for (const item of nonShortVideoItems) {
        const id = item.video_id;
        if (!id) continue;
        if (seenVideoIds.has(id)) continue;
        seenVideoIds.add(id);
        uniqueVideoItems.push(item);
      }

      // Map to VideoResult format
      const videos: VideoResult[] = uniqueVideoItems.map((item) => ({
        youtube_video_id: item.video_id || "",
        title: item.title || "",
        thumbnail_url: item.thumbnail_url || null,
        published_at: item.timestamp || item.publication_date || null,
        views_count: item.views_count || null,
        channel_name: item.channel_name || null,
        raw_payload: item,
      }));

      return {
        success: true,
        videos,
      };
    } catch (error) {
      return {
        success: false,
        videos: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getVideoSubtitles(videoId: string): Promise<GetSubtitlesResult> {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'subtitles-debug',hypothesisId:'A',location:'dataforseo.ts:getVideoSubtitles:entry',message:'fetching subtitles',data:{videoId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      // Use live endpoint for faster response (with required parameters from Python example)
      const result = await this.request<{
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
      }>("/serp/youtube/video_subtitles/live/advanced", [
        {
          video_id: videoId,
          location_code: 2840, // USA
          language_code: "en",
          os: "windows",
          depth: 20,
          subtitles_language: "en",
        },
      ]);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/18d926b1-f741-4713-b147-77616fe448c6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'subtitles-debug',hypothesisId:'B',location:'dataforseo.ts:getVideoSubtitles:response',message:'DataForSEO subtitles response',data:{status_code:result.status_code,hasTasks:!!result.tasks,tasksLen:result.tasks?.length,hasResult:!!result.tasks?.[0]?.result,itemsLen:result.tasks?.[0]?.result?.[0]?.items?.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (result.status_code !== 20000) {
        return {
          success: false,
          transcript: null,
          language: null,
          error: `API returned status code: ${result.status_code}`,
        };
      }

      const items = result.tasks?.[0]?.result?.[0]?.items || [];
      const language = result.tasks?.[0]?.result?.[0]?.subtitle_language || "en";

      if (items.length === 0) {
        return {
          success: false,
          transcript: null,
          language: null,
          error: "Subtitles not available",
        };
      }

      // Concatenate all subtitle text segments
      const transcript = items
        .filter((item) => item.type === "youtube_subtitles" && item.text)
        .map((item) => item.text)
        .join(" ");

      if (!transcript) {
        return {
          success: false,
          transcript: null,
          language: null,
          error: "No subtitle text found",
        };
      }

      return {
        success: true,
        transcript,
        language,
      };
    } catch (error) {
      return {
        success: false,
        transcript: null,
        language: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Singleton instance
export const dataForSeoClient = new DataForSEOClient();

