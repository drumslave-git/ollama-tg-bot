export interface McpToolCallResult {
  text: string;
  structuredContent?: unknown;
  /** Base64 images the tool returned as image content blocks (fed back to the model). */
  images?: string[];
}
