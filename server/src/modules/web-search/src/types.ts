export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface WebSearchSource {
  title: string;
  url: string;
}

export interface WebSearchPayload {
  results: WebSearchResult[];
  answer: string | null;
}
