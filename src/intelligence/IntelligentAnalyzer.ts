import { ContextItem } from '../types/ContextTypes';
import { AIProvider } from '../ai/AIProvider';

export interface AnalysisResult {
    entities: Entity[];
    topics: Topic[];
    relationships: Relationship[];
    importance: number;
    sentiment: SentimentScore;
    summary: string;
    keywords: string[];
}

export interface Entity {
    id: string;
    name: string;
    type: EntityType;
    confidence: number;
    mentions: number;
    context: string;
}

export interface Topic {
    id: string;
    name: string;
    confidence: number;
    keywords: string[];
    description: string;
}

export interface Relationship {
    id: string;
    source: string;
    target: string;
    type: RelationshipType;
    confidence: number;
    description: string;
}

export interface SentimentScore {
    positive: number;
    negative: number;
    neutral: number;
    overall: 'positive' | 'negative' | 'neutral';
}

export type EntityType = 
    | 'person' 
    | 'technology' 
    | 'concept' 
    | 'project' 
    | 'file' 
    | 'function' 
    | 'class' 
    | 'variable'
    | 'organization'
    | 'location'
    | 'other';

export type RelationshipType = 
    | 'references' 
    | 'implements' 
    | 'depends_on' 
    | 'similar_to' 
    | 'follows' 
    | 'contradicts'
    | 'explains'
    | 'extends'
    | 'uses'
    | 'mentions';

export class IntelligentAnalyzer {
    private aiProvider: AIProvider;
    private analysisCache: Map<string, AnalysisResult> = new Map();

    constructor(aiProvider: AIProvider) {
        this.aiProvider = aiProvider;
    }

    /**
     * 分析单个内容项
     */
    async analyzeContent(content: string, contextType?: string): Promise<AnalysisResult> {
        const cacheKey = this.generateCacheKey(content);
        
        // 检查缓存
        if (this.analysisCache.has(cacheKey)) {
            return this.analysisCache.get(cacheKey)!;
        }

        try {
            const result = await this.performDeepAnalysis(content, contextType);
            
            // 缓存结果
            this.analysisCache.set(cacheKey, result);
            
            return result;
        } catch (error) {
            console.error('内容分析失败:', error);
            // 返回基础分析结果
            return this.performBasicAnalysis(content);
        }
    }

    /**
     * 批量分析多个内容项
     */
    async analyzeBatch(items: ContextItem[]): Promise<Map<string, AnalysisResult>> {
        const results = new Map<string, AnalysisResult>();
        
        // 并行处理，但限制并发数
        const batchSize = 3;
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const promises = batch.map(async (item) => {
                const result = await this.analyzeContent(item.content, item.type);
                return { id: item.id, result };
            });
            
            const batchResults = await Promise.all(promises);
            batchResults.forEach(({ id, result }) => {
                results.set(id, result);
            });
        }
        
        return results;
    }

    /**
     * 分析内容间的关系
     */
    async analyzeRelationships(items: ContextItem[]): Promise<Relationship[]> {
        if (items.length < 2) return [];

        const relationships: Relationship[] = [];
        
        // 分析每对内容的关系
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                const rel = await this.analyzeContentRelationship(items[i], items[j]);
                if (rel) {
                    relationships.push(rel);
                }
            }
        }

        return relationships;
    }

    /**
     * 执行深度AI分析
     */
    private async performDeepAnalysis(content: string, contextType?: string): Promise<AnalysisResult> {
        const analysisPrompt = this.buildAnalysisPrompt(content, contextType);
        
        const response = await this.aiProvider.chat([
            {
                role: 'system',
                content: `你是一个专业的内容分析专家。请分析给定的内容，提取关键信息并以JSON格式返回结果。
                
返回格式应该严格遵循以下JSON结构：
{
    "entities": [{"name": "实体名", "type": "实体类型", "confidence": 0.9, "context": "上下文"}],
    "topics": [{"name": "主题名", "confidence": 0.8, "keywords": ["关键词1", "关键词2"], "description": "主题描述"}],
    "relationships": [{"source": "源实体", "target": "目标实体", "type": "关系类型", "confidence": 0.7, "description": "关系描述"}],
    "importance": 0.8,
    "sentiment": {"positive": 0.6, "negative": 0.1, "neutral": 0.3, "overall": "positive"},
    "summary": "内容摘要",
    "keywords": ["关键词1", "关键词2", "关键词3"]
}`
            },
            {
                role: 'user',
                content: analysisPrompt
            }
        ]);

        try {
            const analysisData = JSON.parse(response.content);
            return this.normalizeAnalysisResult(analysisData);
        } catch (error) {
            console.warn('AI分析结果解析失败，使用基础分析:', error);
            return this.performBasicAnalysis(content);
        }
    }

    /**
     * 执行基础分析（不依赖AI）
     */
    private performBasicAnalysis(content: string): AnalysisResult {
        const words = content.toLowerCase().split(/\s+/);
        const wordCount = words.length;
        
        // 基础关键词提取
        const keywords = this.extractBasicKeywords(content);
        
        // 基础实体识别
        const entities = this.extractBasicEntities(content);
        
        // 基础重要性评分
        const importance = this.calculateBasicImportance(content);
        
        // 基础情感分析
        const sentiment = this.calculateBasicSentiment(content);
        
        return {
            entities,
            topics: [{
                id: 'basic-topic',
                name: '一般内容',
                confidence: 0.5,
                keywords: keywords.slice(0, 3),
                description: '基础分析识别的内容'
            }],
            relationships: [],
            importance,
            sentiment,
            summary: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            keywords
        };
    }

    /**
     * 分析两个内容项之间的关系
     */
    private async analyzeContentRelationship(item1: ContextItem, item2: ContextItem): Promise<Relationship | null> {
        // 基础相似度检查
        const similarity = this.calculateTextSimilarity(item1.content, item2.content);
        if (similarity < 0.3) return null;

        try {
            const relationshipPrompt = `
分析以下两个内容片段之间的关系：

内容1 (${item1.type}): ${item1.title}
${item1.content.substring(0, 200)}...

内容2 (${item2.type}): ${item2.title}
${item2.content.substring(0, 200)}...

请以JSON格式返回关系分析结果：
{
    "hasRelationship": true/false,
    "type": "关系类型",
    "confidence": 0.8,
    "description": "关系描述"
}`;

            const response = await this.aiProvider.chat([
                {
                    role: 'system',
                    content: '你是一个专业的内容关系分析专家。请分析两个内容片段之间的关系。'
                },
                {
                    role: 'user',
                    content: relationshipPrompt
                }
            ]);

            const relationData = JSON.parse(response.content);
            
            if (relationData.hasRelationship && relationData.confidence > 0.5) {
                return {
                    id: `rel-${item1.id}-${item2.id}`,
                    source: item1.id,
                    target: item2.id,
                    type: relationData.type as RelationshipType,
                    confidence: relationData.confidence,
                    description: relationData.description
                };
            }
        } catch (error) {
            console.warn('关系分析失败:', error);
        }

        return null;
    }

    /**
     * 构建分析提示词
     */
    private buildAnalysisPrompt(content: string, contextType?: string): string {
        let prompt = `请分析以下内容：\n\n${content}\n\n`;
        
        if (contextType) {
            prompt += `内容类型：${contextType}\n\n`;
        }
        
        prompt += `请提取：
1. 关键实体（人名、技术、概念、项目等）
2. 主要主题和话题
3. 实体间的关系
4. 内容的重要性评分（0-1）
5. 情感倾向分析
6. 内容摘要
7. 关键词列表

请确保返回有效的JSON格式。`;
        
        return prompt;
    }

    /**
     * 标准化分析结果
     */
    private normalizeAnalysisResult(data: any): AnalysisResult {
        return {
            entities: (data.entities || []).map((e: any, index: number) => ({
                id: `entity-${index}`,
                name: e.name || '',
                type: e.type || 'other',
                confidence: Math.min(Math.max(e.confidence || 0.5, 0), 1),
                mentions: 1,
                context: e.context || ''
            })),
            topics: (data.topics || []).map((t: any, index: number) => ({
                id: `topic-${index}`,
                name: t.name || '',
                confidence: Math.min(Math.max(t.confidence || 0.5, 0), 1),
                keywords: t.keywords || [],
                description: t.description || ''
            })),
            relationships: (data.relationships || []).map((r: any, index: number) => ({
                id: `rel-${index}`,
                source: r.source || '',
                target: r.target || '',
                type: r.type || 'mentions',
                confidence: Math.min(Math.max(r.confidence || 0.5, 0), 1),
                description: r.description || ''
            })),
            importance: Math.min(Math.max(data.importance || 0.5, 0), 1),
            sentiment: {
                positive: Math.min(Math.max(data.sentiment?.positive || 0.33, 0), 1),
                negative: Math.min(Math.max(data.sentiment?.negative || 0.33, 0), 1),
                neutral: Math.min(Math.max(data.sentiment?.neutral || 0.34, 0), 1),
                overall: data.sentiment?.overall || 'neutral'
            },
            summary: data.summary || '',
            keywords: data.keywords || []
        };
    }

    /**
     * 基础关键词提取
     */
    private extractBasicKeywords(content: string): string[] {
        const words = content.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3);
        
        const wordCount = new Map<string, number>();
        words.forEach(word => {
            wordCount.set(word, (wordCount.get(word) || 0) + 1);
        });
        
        return Array.from(wordCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }

    /**
     * 基础实体识别
     */
    private extractBasicEntities(content: string): Entity[] {
        const entities: Entity[] = [];
        
        // 识别代码相关实体
        const codePatterns = [
            { pattern: /class\s+(\w+)/gi, type: 'class' as EntityType },
            { pattern: /function\s+(\w+)/gi, type: 'function' as EntityType },
            { pattern: /const\s+(\w+)/gi, type: 'variable' as EntityType },
            { pattern: /let\s+(\w+)/gi, type: 'variable' as EntityType },
            { pattern: /var\s+(\w+)/gi, type: 'variable' as EntityType }
        ];
        
        codePatterns.forEach(({ pattern, type }) => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                entities.push({
                    id: `entity-${entities.length}`,
                    name: match[1],
                    type,
                    confidence: 0.8,
                    mentions: 1,
                    context: match[0]
                });
            }
        });
        
        return entities;
    }

    /**
     * 基础重要性评分
     */
    private calculateBasicImportance(content: string): number {
        let score = 0.5; // 基础分数
        
        // 长度因子
        const length = content.length;
        if (length > 1000) score += 0.2;
        else if (length > 500) score += 0.1;
        
        // 代码块因子
        const codeBlocks = (content.match(/```/g) || []).length / 2;
        score += Math.min(codeBlocks * 0.1, 0.2);
        
        // 问号因子（问题通常比较重要）
        const questions = (content.match(/\?/g) || []).length;
        score += Math.min(questions * 0.05, 0.1);
        
        return Math.min(score, 1);
    }

    /**
     * 基础情感分析
     */
    private calculateBasicSentiment(content: string): SentimentScore {
        const positiveWords = ['好', '棒', '优秀', '完美', '成功', 'good', 'great', 'excellent', 'perfect', 'success'];
        const negativeWords = ['坏', '错误', '失败', '问题', '困难', 'bad', 'error', 'fail', 'problem', 'difficult'];
        
        const lowerContent = content.toLowerCase();
        
        let positive = 0;
        let negative = 0;
        
        positiveWords.forEach(word => {
            const matches = (lowerContent.match(new RegExp(word, 'g')) || []).length;
            positive += matches;
        });
        
        negativeWords.forEach(word => {
            const matches = (lowerContent.match(new RegExp(word, 'g')) || []).length;
            negative += matches;
        });
        
        const total = positive + negative;
        if (total === 0) {
            return { positive: 0.33, negative: 0.33, neutral: 0.34, overall: 'neutral' };
        }
        
        const posScore = positive / total;
        const negScore = negative / total;
        const neuScore = 1 - posScore - negScore;
        
        let overall: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (posScore > negScore && posScore > 0.4) overall = 'positive';
        else if (negScore > posScore && negScore > 0.4) overall = 'negative';
        
        return {
            positive: posScore,
            negative: negScore,
            neutral: neuScore,
            overall
        };
    }

    /**
     * 计算文本相似度
     */
    private calculateTextSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }

    /**
     * 生成缓存键
     */
    private generateCacheKey(content: string): string {
        // 使用内容的哈希作为缓存键
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash.toString(36);
    }

    /**
     * 清理缓存
     */
    clearCache(): void {
        this.analysisCache.clear();
    }

    /**
     * 获取缓存统计
     */
    getCacheStats(): { size: number; keys: string[] } {
        return {
            size: this.analysisCache.size,
            keys: Array.from(this.analysisCache.keys())
        };
    }
}