import Groq from 'groq-sdk';
import { assertServerContext } from './environment';

let client: Groq | undefined;

/**
 * Returns a configured Groq client singleton.
 * Requires GROQ_API_KEY to be set.
 * Throws a clear startup error if the key is missing rather than the SDK's generic message.
 */
export function getGroqClient(): Groq {
  assertServerContext('GroqClient');
  if (!client) {
    const apiKey = process.env['GROQ_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY environment variable is not set. ' +
          'Add it to your .env file. See .env.example for reference.',
      );
    }
    client = new Groq({ apiKey });
  }
  return client;
}

/**
 * Returns true when GROQ_API_KEY is configured.
 * Use this to conditionally enable the Groq provider at startup.
 */
export function isGroqConfigured(): boolean {
  return !!process.env['GROQ_API_KEY'];
}
