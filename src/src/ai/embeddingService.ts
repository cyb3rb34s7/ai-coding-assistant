import * as vscode from 'vscode';
import OpenAI from 'openai';
import { encode } from 'js-tiktoken';

export class EmbeddingService {
    private openai: OpenAI;
    private encoder: any;
    private readonly embeddingModel = 'text-embedding-ada-002';
    private embeddingCache: Map<string, number[]> = new Map();

    constructor() {
        // Get the API key from configuration
        const config = vscode.workspace.getConfiguration('aiCodingAssistant');
        const apiKey = config.get<string>('openaiApiKey') || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            console.warn('OpenAI API key not found. Embeddings will not work.');
        }

        this.openai = new OpenAI({
            apiKey: apiKey
        });

        // Initialize the tokenizer
        try {
            this.encoder = encode('cl100k_base');
        } catch (error) {
            console.error('Failed to initialize tokenizer:', error);
        }
    }

    /**
     * Generate an embedding for the given text
     */
    public async generateEmbedding(text: string): Promise<number[]> {
        // Check cache first
        const cacheKey = this.getCacheKey(text);
        if (this.embeddingCache.has(cacheKey)) {
            return this.embeddingCache.get(cacheKey)!;
        }

        try {
            // Truncate text if needed to stay within token limits
            const truncatedText = this.truncateText(text, 8000);

            const response = await this.openai.embeddings.create({
                model: this.embeddingModel,
                input: truncatedText,
            });

            const embedding = response.data[0].embedding;

            // Cache the result
            this.embeddingCache.set(cacheKey, embedding);

            return embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);

            // Return a zero vector as fallback (not ideal but prevents crashes)
            return new Array(1536).fill(0);
        }
    }

    /**
     * Generate a cache key for the given text
     */
    private getCacheKey(text: string): string {
        // A simple hash function for strings
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }

    /**
     * Truncate text to stay within token limits
     */
    private truncateText(text: string, maxTokens: number): string {
        if (!this.encoder) {
            // If encoder failed to initialize, use character-based approximation
            return text.substring(0, maxTokens * 4); // Rough approximation: 4 chars per token
        }

        const tokens = this.encoder.encode(text);
        if (tokens.length <= maxTokens) {
            return text;
        }

        // Truncate tokens and decode back to text
        const truncatedTokens = tokens.slice(0, maxTokens);
        return this.encoder.decode(truncatedTokens);
    }
}