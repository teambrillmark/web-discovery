"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextExtractor = void 0;
class TextExtractor {
    extractKeyPhrases(text, count = 10) {
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3);
        const freq = {};
        for (const word of words) {
            freq[word] = (freq[word] ?? 0) + 1;
        }
        return Object.entries(freq)
            .sort(([, a], [, b]) => b - a)
            .slice(0, count)
            .map(([word]) => word);
    }
    calculateTextSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }
    normalizeText(text) {
        return text.toLowerCase().trim().replace(/\s+/g, ' ');
    }
    truncate(text, maxLength) {
        if (text.length <= maxLength)
            return text;
        return text.slice(0, maxLength - 3) + '...';
    }
}
exports.TextExtractor = TextExtractor;
//# sourceMappingURL=text-extractor.js.map