import type { CrawlResult } from '../types';

export interface ICrawler {
  fetch(url: string): Promise<CrawlResult>;
}
