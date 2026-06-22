export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  error?: string;
}

export interface LinkFetchInput {
  message: string;
  replyContext?: string | null;
}

export interface LinkFetchOutput {
  context: string | null;
  urlCount: number;
  /** At least one detected URL returned page content. */
  resolved: boolean;
  reason: string;
  pages: FetchedPage[];
}
