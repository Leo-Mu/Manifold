import { ContextItem } from '../types/ContextTypes';
import { DatabaseManager } from '../storage/DatabaseManager';
import { ChatHistoryParser } from '../parsers/ChatHistoryParser';
import { AIProvider } from '../ai/AIProvider';
import { IntelligentAnalyzer, AnalysisResult } from './IntelligentAnalyzer';
import { VectorStore } from './VectorStore';
import { RecommendationEngine, RecommendationResult } from './RecommendationEngine';

export interface IntelligentProcessingResult {
    newItems: ContextItem[];
    updatedItems: ContextItem[];
    recommendations: RecommendationResult;
    insights: ProcessingInsight[];
    reorganizationSuggestions: ReorganizationSuggestion[];
}

export interface ProcessingInsight {
    type: InsightType;
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
    relatedItems: string[];
}

export interface ReorganizationSuggestion {
    type: ReorganizationType;
    title: string;
    description: string;
    affectedItems: string[];
    confidence: number;
    autoApplicable: boolean;
}

export interface IntelligentConfig {
    enableRealTimeProcessing: boolean;
    enableAutoReorganization: boolean;
    analysisDepth: 'shallow' | 'medium' | 'deep';
    recommendationThreshold: number;
    maxRecommendations: number;
    learningEnabled: boolean;
}

export type InsightType = 
    | 'pattern_discovery'
    | 'topic_emergence'
    | 'relationship_found'
    | 'knowledge_gap'
    | 'trend_analysis'
    | 'quality_issue'
    | 'duplication_detected';

export type ReorganizationType = 
    | 'merge_similar'
    | 'split_complex'
    | 'create_category'
    | 'update_tags'
    | 'archive_old'
    | 'promote_important';

export class IntelligentContextManager {
    private dbManager: DatabaseManager;
    private chatParser: ChatHistoryParser;
    private aiProvider: AIProvider;
    private analyzer: IntelligentAnalyzer;
    private vectorStore: VectorStore;
    private recommendationEngine: RecommendationEngine;
    private config: IntelligentConfig;
    private processingQueue: ProcessingTask[] = [];
    private isProcessing = false;

    constructor(
        dbManager: DatabaseManager,
        chatParser: ChatHistoryParser,
        aiProvider: AIProvider,
        config: Partial<IntelligentConfig> = {}
    ) {
        this.dbManager = dbManager;
        this.chatParser = chatParser;
        this.aiProvider = aiProvider;
        
        // 初始化智能组件
        this.analyzer = new IntelligentAnalyzer(aiProvider);
        this.vectorStore = new VectorStore(aiProvider);
        this.recommendationEngine = new RecommendationEngine(this.vectorStore, this.analyzer);
        
        // 配置
        this.config = {
            enableRealTimeProcessing: true,
            enableAutoReorganization: false,
            analysisDepth: 'medium',
            recommendationThreshold: 0.6,
            maxRecommendations: 10,
            learningEnabled: true,
            ...config
        };
    }

    /**
     * 智能解析和存储内容
     */
    async intelligentParseAndStore(content: string): Promise<IntelligentProcessingResult> {
        console.log('开始智能解析和存储，内容长度:', content.length);
        
        try {
            // 1. 基础解析
            const parsed = this.chatParser.parse(content);
            console.log('基础解析完成:', {
                codeBlocks: parsed.codeBlocks.length,
                jsonBlocks: parsed.jsonBlocks.length,
                qaBlocks: parsed.qaBlocks.length
            });

            // 2. 创建上下文项
            const newItems = await this.createContextItems(parsed);
            console.log('创建上下文项:', newItems.length);

            // 3. 智能分析
            const analysisResults = await this.performIntelligentAnalysis(newItems);
            console.log('智能分析完成');

            // 4. 存储到数据库和向量存储
            await this.storeIntelligentItems(newItems, analysisResults);
            console.log('存储完成');

            // 5. 生成推荐
            const recommendations = await this.generateRecommendations(newItems);
            console.log('推荐生成完成:', recommendations.items.length);

            // 6. 发现洞察
            const insights = await this.discoverInsights(newItems, analysisResults);
            console.log('洞察发现完成:', insights.length);

            // 7. 生成重组建议
            const reorganizationSuggestions = await this.generateReorganizationSuggestions(newItems);
            console.log('重组建议生成完成:', reorganizationSuggestions.length);

            // 8. 自动应用重组（如果启用）
            const updatedItems = await this.applyAutoReorganization(reorganizationSuggestions);

            return {
                newItems,
                updatedItems,
                recommendations,
                insights,
                reorganizationSuggestions
            };

        } catch (error) {
            console.error('智能处理失败:', error);
            // 降级到基础处理
            return this.fallbackProcessing(content);
        }
    }

    /**
     * 获取智能推荐
     */
    async getIntelligentRecommendations(
        query?: string,
        currentContext?: ContextItem[],
        maxResults?: number
    ): Promise<RecommendationResult> {
        return this.recommendationEngine.recommend({
            query,
            currentContext,
            maxResults: maxResults || this.config.maxRecommendations
        });
    }

    /**
     * 基于内容获取相关推荐
     */
    async getRelatedContent(itemId: string, maxResults: number = 5): Promise<RecommendationResult> {
        return this.recommendationEngine.getRelatedContent(itemId, maxResults);
    }

    /**
     * 智能搜索
     */
    async intelligentSearch(query: string, options: {
        includeSemanticSearch?: boolean;
        includeRecommendations?: boolean;
        maxResults?: number;
    } = {}): Promise<{
        directMatches: ContextItem[];
        semanticMatches: ContextItem[];
        recommendations: RecommendationResult;
    }> {
        const {
            includeSemanticSearch = true,
            includeRecommendations = true,
            maxResults = 20
        } = options;

        // 1. 直接文本搜索
        const directMatches = await this.dbManager.searchContexts(query);

        // 2. 语义搜索
        let semanticMatches: ContextItem[] = [];
        if (includeSemanticSearch) {
            const similarResults = await this.vectorStore.findSimilar(query, 0.5, maxResults);
            semanticMatches = similarResults.map(r => r.item);
        }

        // 3. 智能推荐
        let recommendations: RecommendationResult = {
            items: [],
            explanation: '',
            confidence: 0,
            strategy: 'hybrid',
            metadata: {
                processingTime: 0,
                totalCandidates: 0,
                filtersApplied: [],
                algorithmVersion: '1.0.0'
            }
        };

        if (includeRecommendations) {
            recommendations = await this.recommendationEngine.recommendByQuery(query, maxResults);
        }

        return {
            directMatches: directMatches.slice(0, maxResults),
            semanticMatches,
            recommendations
        };
    }

    /**
     * 分析内容关系网络
     */
    async analyzeRelationshipNetwork(itemIds: string[]): Promise<{
        nodes: NetworkNode[];
        edges: NetworkEdge[];
        clusters: NetworkCluster[];
        insights: string[];
    }> {
        const items = await this.dbManager.getContextsByIds(itemIds);
        
        // 分析关系
        const relationships = await this.analyzer.analyzeRelationships(items);
        
        // 构建网络节点
        const nodes: NetworkNode[] = items.map(item => ({
            id: item.id,
            label: item.title,
            type: item.type,
            size: this.calculateNodeSize(item),
            color: this.getNodeColor(item.type)
        }));

        // 构建网络边
        const edges: NetworkEdge[] = relationships.map(rel => ({
            source: rel.source,
            target: rel.target,
            type: rel.type,
            weight: rel.confidence,
            label: rel.description
        }));

        // 执行聚类分析
        const clusterResults = await this.vectorStore.performClustering(Math.min(5, Math.ceil(items.length / 3)));
        const clusters: NetworkCluster[] = clusterResults.map((cluster, index) => ({
            id: cluster.clusterId,
            label: `聚类 ${index + 1}`,
            nodes: cluster.items.map(item => item.id),
            coherence: cluster.coherence
        }));

        // 生成洞察
        const insights = this.generateNetworkInsights(nodes, edges, clusters);

        return { nodes, edges, clusters, insights };
    }

    /**
     * 获取处理统计信息
     */
    getProcessingStats(): {
        totalProcessed: number;
        averageProcessingTime: number;
        analysisStats: any;
        vectorStats: any;
        recommendationStats: any;
    } {
        return {
            totalProcessed: this.processingQueue.length,
            averageProcessingTime: this.calculateAverageProcessingTime(),
            analysisStats: this.analyzer.getCacheStats(),
            vectorStats: this.vectorStore.getStats(),
            recommendationStats: this.recommendationEngine.getRecommendationStats()
        };
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<IntelligentConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * 清理缓存和临时数据
     */
    cleanup(): void {
        this.analyzer.clearCache();
        this.vectorStore.clearCache();
        this.processingQueue = [];
    }

    /**
     * 创建上下文项
     */
    private async createContextItems(parsed: any): Promise<ContextItem[]> {
        const items: ContextItem[] = [];

        // 处理代码块
        for (const codeBlock of parsed.codeBlocks) {
            items.push({
                id: this.generateId(),
                type: 'code',
                title: `${codeBlock.language} 代码片段`,
                content: codeBlock.code,
                preview: codeBlock.code.substring(0, 100) + (codeBlock.code.length > 100 ? '...' : ''),
                timestamp: new Date(),
                metadata: {
                    language: codeBlock.language,
                    lineCount: codeBlock.code.split('\n').length
                }
            });
        }

        // 处理JSON数据
        for (const jsonData of parsed.jsonBlocks) {
            const jsonStr = JSON.stringify(jsonData, null, 2);
            items.push({
                id: this.generateId(),
                type: 'json',
                title: 'JSON 数据',
                content: jsonStr,
                preview: jsonStr.substring(0, 100) + (jsonStr.length > 100 ? '...' : ''),
                timestamp: new Date(),
                metadata: {
                    keys: Object.keys(jsonData).length
                }
            });
        }

        // 处理问答对
        for (const qa of parsed.qaBlocks) {
            items.push({
                id: this.generateId(),
                type: 'qa',
                title: qa.question.length > 50 ? qa.question.substring(0, 50) + '...' : qa.question,
                content: `Q: ${qa.question}\n\nA: ${qa.answer}`,
                preview: qa.question,
                timestamp: new Date(),
                metadata: {
                    questionLength: qa.question.length,
                    answerLength: qa.answer.length
                }
            });
        }

        return items;
    }

    /**
     * 执行智能分析
     */
    private async performIntelligentAnalysis(items: ContextItem[]): Promise<Map<string, AnalysisResult>> {
        if (this.config.analysisDepth === 'shallow') {
            // 浅层分析：只分析重要项目
            const importantItems = items.filter(item => item.content.length > 200);
            return this.analyzer.analyzeBatch(importantItems);
        } else {
            // 深度分析：分析所有项目
            return this.analyzer.analyzeBatch(items);
        }
    }

    /**
     * 存储智能项目
     */
    private async storeIntelligentItems(
        items: ContextItem[],
        analysisResults: Map<string, AnalysisResult>
    ): Promise<void> {
        // 存储到数据库
        for (const item of items) {
            const analysis = analysisResults.get(item.id);
            if (analysis) {
                // 增强元数据
                item.metadata = {
                    ...item.metadata,
                    importance: analysis.importance,
                    sentiment: analysis.sentiment.overall,
                    keywords: analysis.keywords,
                    entities: analysis.entities.map(e => e.name),
                    topics: analysis.topics.map(t => t.name)
                };
            }
            
            await this.dbManager.insertContext(item);
        }

        // 存储到向量数据库
        await this.vectorStore.storeBatch(items);
    }

    /**
     * 生成推荐
     */
    private async generateRecommendations(newItems: ContextItem[]): Promise<RecommendationResult> {
        if (newItems.length === 0) {
            return {
                items: [],
                explanation: '没有新内容可推荐',
                confidence: 0,
                strategy: 'hybrid',
                metadata: {
                    processingTime: 0,
                    totalCandidates: 0,
                    filtersApplied: [],
                    algorithmVersion: '1.0.0'
                }
            };
        }

        // 基于新内容生成推荐
        return this.recommendationEngine.recommendByContext(newItems, this.config.maxRecommendations);
    }

    /**
     * 发现洞察
     */
    private async discoverInsights(
        newItems: ContextItem[],
        analysisResults: Map<string, AnalysisResult>
    ): Promise<ProcessingInsight[]> {
        const insights: ProcessingInsight[] = [];

        // 1. 主题出现洞察
        const topicInsights = this.discoverTopicInsights(analysisResults);
        insights.push(...topicInsights);

        // 2. 模式发现洞察
        const patternInsights = this.discoverPatternInsights(newItems);
        insights.push(...patternInsights);

        // 3. 质量问题洞察
        const qualityInsights = this.discoverQualityInsights(newItems, analysisResults);
        insights.push(...qualityInsights);

        return insights;
    }

    /**
     * 生成重组建议
     */
    private async generateReorganizationSuggestions(newItems: ContextItem[]): Promise<ReorganizationSuggestion[]> {
        const suggestions: ReorganizationSuggestion[] = [];

        // 1. 检测重复内容
        const duplicateSuggestions = await this.detectDuplicateContent(newItems);
        suggestions.push(...duplicateSuggestions);

        // 2. 检测可合并的相似内容
        const mergeSuggestions = await this.detectMergeableContent(newItems);
        suggestions.push(...mergeSuggestions);

        // 3. 检测需要拆分的复杂内容
        const splitSuggestions = this.detectSplittableContent(newItems);
        suggestions.push(...splitSuggestions);

        return suggestions;
    }

    /**
     * 应用自动重组
     */
    private async applyAutoReorganization(suggestions: ReorganizationSuggestion[]): Promise<ContextItem[]> {
        const updatedItems: ContextItem[] = [];

        if (!this.config.enableAutoReorganization) {
            return updatedItems;
        }

        for (const suggestion of suggestions) {
            if (suggestion.autoApplicable && suggestion.confidence > 0.8) {
                try {
                    const updated = await this.applySuggestion(suggestion);
                    updatedItems.push(...updated);
                } catch (error) {
                    console.warn('自动重组失败:', error);
                }
            }
        }

        return updatedItems;
    }

    /**
     * 降级处理
     */
    private async fallbackProcessing(content: string): Promise<IntelligentProcessingResult> {
        console.log('使用降级处理模式');
        
        const parsed = this.chatParser.parse(content);
        const newItems = await this.createContextItems(parsed);
        
        // 存储到数据库
        for (const item of newItems) {
            await this.dbManager.insertContext(item);
        }

        return {
            newItems,
            updatedItems: [],
            recommendations: {
                items: [],
                explanation: '智能推荐暂时不可用',
                confidence: 0,
                strategy: 'hybrid',
                metadata: {
                    processingTime: 0,
                    totalCandidates: 0,
                    filtersApplied: [],
                    algorithmVersion: '1.0.0'
                }
            },
            insights: [],
            reorganizationSuggestions: []
        };
    }

    /**
     * 发现主题洞察
     */
    private discoverTopicInsights(analysisResults: Map<string, AnalysisResult>): ProcessingInsight[] {
        const insights: ProcessingInsight[] = [];
        const topicCounts = new Map<string, number>();

        // 统计主题出现频率
        for (const analysis of analysisResults.values()) {
            for (const topic of analysis.topics) {
                topicCounts.set(topic.name, (topicCounts.get(topic.name) || 0) + 1);
            }
        }

        // 发现新兴主题
        for (const [topic, count] of topicCounts) {
            if (count >= 3) { // 出现3次以上认为是新兴主题
                insights.push({
                    type: 'topic_emergence',
                    title: `新兴主题: ${topic}`,
                    description: `主题"${topic}"在最近的内容中出现了${count}次，可能值得关注`,
                    confidence: Math.min(0.9, count / 10),
                    actionable: true,
                    relatedItems: []
                });
            }
        }

        return insights;
    }

    /**
     * 发现模式洞察
     */
    private discoverPatternInsights(newItems: ContextItem[]): ProcessingInsight[] {
        const insights: ProcessingInsight[] = [];

        // 检测代码模式
        const codeItems = newItems.filter(item => item.type === 'code');
        if (codeItems.length >= 3) {
            const languages = codeItems.map(item => item.metadata?.language).filter(Boolean);
            const languageCounts = new Map<string, number>();
            
            languages.forEach(lang => {
                languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
            });

            const dominantLanguage = Array.from(languageCounts.entries())
                .sort((a, b) => b[1] - a[1])[0];

            if (dominantLanguage && dominantLanguage[1] >= 2) {
                insights.push({
                    type: 'pattern_discovery',
                    title: `代码语言模式: ${dominantLanguage[0]}`,
                    description: `检测到主要使用${dominantLanguage[0]}语言的代码模式`,
                    confidence: 0.7,
                    actionable: false,
                    relatedItems: codeItems.map(item => item.id)
                });
            }
        }

        return insights;
    }

    /**
     * 发现质量问题洞察
     */
    private discoverQualityInsights(
        newItems: ContextItem[],
        analysisResults: Map<string, AnalysisResult>
    ): ProcessingInsight[] {
        const insights: ProcessingInsight[] = [];

        // 检测低质量内容
        for (const item of newItems) {
            const analysis = analysisResults.get(item.id);
            if (analysis && analysis.importance < 0.3) {
                insights.push({
                    type: 'quality_issue',
                    title: `低质量内容: ${item.title}`,
                    description: '检测到可能的低质量内容，建议审查或改进',
                    confidence: 1 - analysis.importance,
                    actionable: true,
                    relatedItems: [item.id]
                });
            }
        }

        return insights;
    }

    /**
     * 检测重复内容
     */
    private async detectDuplicateContent(newItems: ContextItem[]): Promise<ReorganizationSuggestion[]> {
        const suggestions: ReorganizationSuggestion[] = [];
        
        for (let i = 0; i < newItems.length; i++) {
            for (let j = i + 1; j < newItems.length; j++) {
                const similarity = this.calculateTextSimilarity(
                    newItems[i].content,
                    newItems[j].content
                );
                
                if (similarity > 0.8) {
                    suggestions.push({
                        type: 'merge_similar',
                        title: `合并重复内容`,
                        description: `"${newItems[i].title}"和"${newItems[j].title}"内容高度相似，建议合并`,
                        affectedItems: [newItems[i].id, newItems[j].id],
                        confidence: similarity,
                        autoApplicable: similarity > 0.9
                    });
                }
            }
        }
        
        return suggestions;
    }

    /**
     * 检测可合并内容
     */
    private async detectMergeableContent(newItems: ContextItem[]): Promise<ReorganizationSuggestion[]> {
        const suggestions: ReorganizationSuggestion[] = [];
        
        // 按类型分组
        const typeGroups = new Map<string, ContextItem[]>();
        newItems.forEach(item => {
            const group = typeGroups.get(item.type) || [];
            group.push(item);
            typeGroups.set(item.type, group);
        });

        // 检测同类型的相关内容
        for (const [type, items] of typeGroups) {
            if (items.length >= 3) {
                suggestions.push({
                    type: 'create_category',
                    title: `创建${type}类别`,
                    description: `检测到${items.length}个${type}类型的内容，建议创建专门的类别`,
                    affectedItems: items.map(item => item.id),
                    confidence: 0.6,
                    autoApplicable: false
                });
            }
        }

        return suggestions;
    }

    /**
     * 检测可拆分内容
     */
    private detectSplittableContent(newItems: ContextItem[]): ReorganizationSuggestion[] {
        const suggestions: ReorganizationSuggestion[] = [];

        for (const item of newItems) {
            if (item.content.length > 5000) { // 内容过长
                suggestions.push({
                    type: 'split_complex',
                    title: `拆分复杂内容: ${item.title}`,
                    description: '内容过长，建议拆分为多个较小的片段',
                    affectedItems: [item.id],
                    confidence: 0.7,
                    autoApplicable: false
                });
            }
        }

        return suggestions;
    }

    /**
     * 应用建议
     */
    private async applySuggestion(suggestion: ReorganizationSuggestion): Promise<ContextItem[]> {
        // 这里实现具体的重组逻辑
        // 目前返回空数组，实际实现需要根据建议类型执行相应操作
        return [];
    }

    /**
     * 计算节点大小
     */
    private calculateNodeSize(item: ContextItem): number {
        const baseSize = 10;
        const contentFactor = Math.min(2, item.content.length / 1000);
        return baseSize + contentFactor * 5;
    }

    /**
     * 获取节点颜色
     */
    private getNodeColor(type: string): string {
        const colors = {
            code: '#4CAF50',
            json: '#2196F3',
            qa: '#FF9800',
            text: '#9E9E9E'
        };
        return colors[type as keyof typeof colors] || colors.text;
    }

    /**
     * 生成网络洞察
     */
    private generateNetworkInsights(
        nodes: NetworkNode[],
        edges: NetworkEdge[],
        clusters: NetworkCluster[]
    ): string[] {
        const insights: string[] = [];

        insights.push(`网络包含${nodes.length}个节点和${edges.length}条边`);
        insights.push(`识别出${clusters.length}个主要聚类`);

        if (edges.length > 0) {
            const avgWeight = edges.reduce((sum, edge) => sum + edge.weight, 0) / edges.length;
            insights.push(`平均关系强度: ${(avgWeight * 100).toFixed(1)}%`);
        }

        return insights;
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
     * 计算平均处理时间
     */
    private calculateAverageProcessingTime(): number {
        if (this.processingQueue.length === 0) return 0;
        
        const totalTime = this.processingQueue.reduce((sum, task) => sum + (task.endTime || 0) - task.startTime, 0);
        return totalTime / this.processingQueue.length;
    }

    /**
     * 生成ID
     */
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

interface ProcessingTask {
    id: string;
    type: string;
    startTime: number;
    endTime?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface NetworkNode {
    id: string;
    label: string;
    type: string;
    size: number;
    color: string;
}

interface NetworkEdge {
    source: string;
    target: string;
    type: string;
    weight: number;
    label: string;
}

interface NetworkCluster {
    id: string;
    label: string;
    nodes: string[];
    coherence: number;
}