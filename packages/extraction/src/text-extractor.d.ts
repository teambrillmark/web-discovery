export declare class TextExtractor {
    extractKeyPhrases(text: string, count?: number): string[];
    calculateTextSimilarity(text1: string, text2: string): number;
    normalizeText(text: string): string;
    truncate(text: string, maxLength: number): string;
}
