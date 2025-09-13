export interface ContextItem {
    id: string;
    type: 'code' | 'json' | 'qa' | 'text';
    title: string;
    content: string;
    preview?: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

export interface CodeBlock {
    language: string;
    code: string;
}

export interface QABlock {
    question: string;
    answer: string;
}

export interface ParsedContent {
    codeBlocks: CodeBlock[];
    jsonBlocks: any[];
    qaBlocks: QABlock[];
}

export interface ContextSearchResult {
    items: ContextItem[];
    totalCount: number;
}

export interface ContextComposition {
    id: string;
    title: string;
    contextIds: string[];
    createdAt: Date;
}