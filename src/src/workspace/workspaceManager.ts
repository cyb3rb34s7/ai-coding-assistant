import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SimpleVectorDB, Document } from 'simple-vector-db';
import { EmbeddingService } from '../ai/embeddingService';

// Interface for code chunks
interface CodeChunk {
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
}

export class WorkspaceManager {
    private vectorDB: SimpleVectorDB;
    private embeddingService: EmbeddingService;
    private fileChunks: Map<string, CodeChunk[]> = new Map();
    private indexedFiles: Set<string> = new Set();
    private projectMetadata: any = {};

    constructor(embeddingService: EmbeddingService) {
        this.embeddingService = embeddingService;
        this.vectorDB = new SimpleVectorDB();
    }

    /**
     * Index the current workspace by generating embeddings for all code files
     */
    public async indexWorkspace(): Promise<void> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // Collect project metadata
        await this.collectProjectMetadata(rootPath);

        // Find all code files
        const files = await this.findAllCodeFiles(rootPath);

        // Process each file and generate embeddings
        for (const file of files) {
            await this.processFile(file);
        }

        console.log(`Indexed ${this.indexedFiles.size} files with ${this.vectorDB.size()} chunks`);
    }

    /**
     * Process a single file, breaking it into chunks and generating embeddings
     */
    private async processFile(filePath: string): Promise<void> {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const relativePath = this.getRelativePath(filePath);

            // Skip if already indexed and content hasn't changed
            if (this.isFileAlreadyIndexed(relativePath, fileContent)) {
                return;
            }

            // Break file into chunks
            const chunks = this.chunkFile(fileContent, relativePath);
            this.fileChunks.set(relativePath, chunks);

            // Generate embeddings for each chunk
            for (const chunk of chunks) {
                const embedding = await this.embeddingService.generateEmbedding(chunk.content);

                // Store in vector DB
                this.vectorDB.add({
                    id: `${relativePath}:${chunk.startLine}-${chunk.endLine}`,
                    vector: embedding,
                    metadata: {
                        filePath: relativePath,
                        startLine: chunk.startLine,
                        endLine: chunk.endLine,
                        content: chunk.content
                    }
                });
            }

            this.indexedFiles.add(relativePath);
        } catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
        }
    }

    /**
     * Find all code files in the workspace that should be indexed
     */
    private async findAllCodeFiles(rootPath: string): Promise<string[]> {
        const codeFiles: string[] = [];

        const findFiles = async (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip node_modules, .git, etc.
                    if (['node_modules', '.git', 'dist', 'build', 'out'].includes(entry.name)) {
                        continue;
                    }
                    await findFiles(fullPath);
                } else if (this.isCodeFile(entry.name)) {
                    codeFiles.push(fullPath);
                }
            }
        };

        await findFiles(rootPath);
        return codeFiles;
    }

    /**
     * Determine if a file is a code file based on extension
     */
    private isCodeFile(fileName: string): boolean {
        const codeExtensions = [
            '.js', '.ts', '.jsx', '.tsx',
            '.java', '.py', '.c', '.cpp', '.h',
            '.cs', '.go', '.rb', '.php',
            '.html', '.css', '.scss', '.less',
            '.json', '.yml', '.yaml',
            '.md', '.xml'
        ];

        const ext = path.extname(fileName).toLowerCase();
        return codeExtensions.includes(ext);
    }

    /**
     * Break a file into logical chunks for embedding
     */
    private chunkFile(content: string, filePath: string): CodeChunk[] {
        const lines = content.split('\n');
        const chunks: CodeChunk[] = [];

        // Different chunking strategies for different file types
        const ext = path.extname(filePath).toLowerCase();

        // For now, use a simple line-based chunking strategy
        // This would be enhanced with language-specific chunking in a real implementation
        const chunkSize = 50; // Lines per chunk
        const overlap = 10;   // Overlap between chunks

        for (let i = 0; i < lines.length; i += chunkSize - overlap) {
            const endLine = Math.min(i + chunkSize, lines.length);
            const chunkContent = lines.slice(i, endLine).join('\n');

            chunks.push({
                filePath,
                content: chunkContent,
                startLine: i,
                endLine: endLine - 1
            });

            if (endLine >= lines.length) break;
        }

        return chunks;
    }

    /**
     * Get relevant code for a given query
     */
    public async getRelevantCode(query: string, maxChunks: number = 5): Promise<Document[]> {
        const queryEmbedding = await this.embeddingService.generateEmbedding(query);
        const results = this.vectorDB.search(queryEmbedding, maxChunks);
        return results;
    }

    /**
     * Get the complete file content for a given path
     */
    public getFileContent(filePath: string): string | null {
        try {
            const fullPath = this.getFullPath(filePath);
            return fs.readFileSync(fullPath, 'utf8');
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Collect metadata about the project
     */
    private async collectProjectMetadata(rootPath: string): Promise<void> {
        // Look for package.json
        const packageJsonPath = path.join(rootPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                this.projectMetadata.packageJson = packageJson;
            } catch (error) {
                console.error('Error parsing package.json:', error);
            }
        }

        // Look for other project config files (tsconfig.json, .gitignore, etc.)
        const configFiles = [
            'tsconfig.json',
            '.gitignore',
            'webpack.config.js',
            'babel.config.js',
            'jest.config.js',
            'pom.xml',
            'build.gradle'
        ];

        for (const configFile of configFiles) {
            const configPath = path.join(rootPath, configFile);
            if (fs.existsSync(configPath)) {
                try {
                    const content = fs.readFileSync(configPath, 'utf8');
                    this.projectMetadata[configFile] = content;
                } catch (error) {
                    console.error(`Error reading ${configFile}:`, error);
                }
            }
        }
    }

    /**
     * Get project metadata
     */
    public getProjectMetadata(): any {
        return this.projectMetadata;
    }

    /**
     * Check if a file is already indexed and content hasn't changed
     */
    private isFileAlreadyIndexed(relativePath: string, content: string): boolean {
        // In a real implementation, you'd hash the content and compare
        // For now, just check if it's in the indexed set
        return this.indexedFiles.has(relativePath);
    }

    /**
     * Convert a full path to a relative path
     */
    private getRelativePath(fullPath: string): string {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return fullPath;
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        return path.relative(rootPath, fullPath);
    }

    /**
     * Convert a relative path to a full path
     */
    private getFullPath(relativePath: string): string {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        return path.join(rootPath, relativePath);
    }
}