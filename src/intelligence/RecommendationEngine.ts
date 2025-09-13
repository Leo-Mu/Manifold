import { ContextItem } from '../types/ContextTypes';
import { VectorStore, SimilarityResult } from './VectorStore';
import { IntelligentAnalyzer, AnalysisResult } from './IntelligentAnalyzer';

export interface RecommendationRequest {
    query?: string;
    currentContext?: ContextItem[];
    userPreferences?: UserPreferences;
    workingContext?: WorkingContext;
    maxResults?: number;
}

export interface RecommendationResult {
    items: RecommendedItem[];
    explanation: string;
    confidence: number;
    strategy: RecommendationStrategy;
    metadata: RecommendationMetadata;
}

export interface RecommendedItem {
    item: ContextItem;
    score: number;
    reasons: RecommendationReason[];
    similarity?: number;
    relevanceFactors: RelevanceFactor[];
}

export interface RecommendationReason {
    type: ReasonType;
    description: string;
    weight: number;
    evidence: string;
}

export interface RelevanceFactor {
    factor: string;
    value: number;
    weight: number;
    description: string;
}

export interface UserPreferences {
    preferredTypes: string[];
    timePreference: 'recent' | 'all' | 'historical';
    complexityPreference: 'simple' | 'medium' | 'complex';
    topicInterests: string[];
    languagePreferences: string[];
}

export interface WorkingContext {
    currentFile?: string;
    currentProject?: string;
    recentActivity: string[];
    activeTopics: string[];
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

export interface RecommendationMetadata {
    processingTime: number;
    totalCandidates: number;
    filtersApplied: string[];
    algorithmVersion: string;
}

export type ReasonType = 
    | 'semantic_similarity'
    | 'temporal_relevance'
    | 'topic_match'
    | 'user_preference'
    | 'working_context'
    | 'collaborative_filtering'
    | 'content_based'
    | 'hybrid';

export type RecommendationStrategy = 
    | 'semantic_search'
    | 'collaborative_filtering'
    | 'content_based'
    | 'hybrid'
    | 'contextual'
    | 'temporal';

export class RecommendationEngine {
    private vectorStore: VectorStore;
    private analyzer: IntelligentAnalyzer;
    private userPreferences: UserPreferences;
    private usageHistory: Map<string, UsageRecord> = new Map();
    private recommendationHistory: RecommendationResult[] = [];

    constructor(vectorStore: VectorStore, analyzer: IntelligentAnalyzer) {
        this.vectorStore = vectorStore;
        this.analyzer = analyzer;
        this.userPreferences = this.getDefaultPreferences();
    }

    /**
     * 生成推荐结果
     */
    async recommend(request: RecommendationRequest): Promise<RecommendationResult> {
        const startTime = Date.now();
        
        try {
            // 确定推荐策略
            const strategy = this.determineStrategy(request);
            
            // 获取候选项
            const candidates = await this.getCandidates(request, strategy);
            
            // 计算推荐分数
            const scoredItems = await this.scoreItems(candidates, request, strategy);
            
            // 应用过滤器和排序
            const filteredItems = this.applyFilters(scoredItems, request);
            const sortedItems = this.sortByScore(filteredItems);
            
            // 限制结果数量
            const maxResults = request.maxResults || 10;
            const finalItems = sortedItems.slice(0, maxResults);
            
            // 生成解释
            const explanation = this.generateExplanation(finalItems, strategy, request);
            
            // 计算整体置信度
            const confidence = this.calculateOverallConfidence(finalItems);
            
            const result: RecommendationResult = {
                items: finalItems,
                explanation,
                confidence,
                strategy,
                metadata: {
                    processingTime: Date.now() - startTime,
                    totalCandidates: candidates.length,
                    filtersApplied: this.getAppliedFilters(request),
                    algorithmVersion: '1.0.0'
                }
            };
            
            // 记录推荐历史
            this.recordRecommendation(result);
            
            return result;
            
        } catch (error) {
            console.error('推荐生成失败:', error);
            return this.getFallbackRecommendation(request);
        }
    }

    /**
     * 基于查询的语义搜索推荐
     */
    async recommendByQuery(query: string, maxResults: number = 10): Promise<RecommendationResult> {
        return this.recommend({
            query,
            maxResults,
            userPreferences: this.userPreferences
        });
    }

    /**
     * 基于当前上下文的推荐
     */
    async recommendByContext(
        currentContext: ContextItem[], 
        maxResults: number = 10
    ): Promise<RecommendationResult> {
        return this.recommend({
            currentContext,
            maxResults,
            userPreferences: this.userPreferences
        });
    }

    /**
     * 获取相关内容推荐
     */
    async getRelatedContent(itemId: string, maxResults: number = 5): Promise<RecommendationResult> {
        try {
            const similarItems = await this.vectorStore.findSimilarById(itemId, 0.6, maxResults);
            
            const recommendedItems: RecommendedItem[] = similarItems.map(sim => ({
                item: sim.item,
                score: sim.similarity,
                similarity: sim.similarity,
                reasons: [{
                    type: 'semantic_similarity',
                    description: `与当前内容的语义相似度为 ${(sim.similarity * 100).toFixed(1)}%`,
                    weight: 1.0,
                    evidence: '基于向量相似度计算'
                }],
                relevanceFactors: [{
                    factor: 'semantic_similarity',
                    value: sim.similarity,
                    weight: 1.0,
                    description: '语义相似度'
                }]
            }));
            
            return {
                items: recommendedItems,
                explanation: `基于语义相似度找到 ${recommendedItems.length} 个相关内容`,
                confidence: this.calculateOverallConfidence(recommendedItems),
                strategy: 'semantic_search',
                metadata: {
                    processingTime: 0,
                    totalCandidates: similarItems.length,
                    filtersApplied: ['similarity_threshold'],
                    algorithmVersion: '1.0.0'
                }
            };
            
        } catch (error) {
            console.error('相关内容推荐失败:', error);
            return this.getFallbackRecommendation({ maxResults });
        }
    }

    /**
     * 更新用户偏好
     */
    updateUserPreferences(preferences: Partial<UserPreferences>): void {
        this.userPreferences = {
            ...this.userPreferences,
            ...preferences
        };
    }

    /**
     * 记录用户交互
     */
    recordUserInteraction(itemId: string, interactionType: 'view' | 'use' | 'like' | 'dislike'): void {
        const existing = this.usageHistory.get(itemId) || {
            itemId,
            viewCount: 0,
            useCount: 0,
            likeCount: 0,
            dislikeCount: 0,
            lastAccessed: new Date(),
            firstAccessed: new Date()
        };
        
        switch (interactionType) {
            case 'view':
                existing.viewCount++;
                break;
            case 'use':
                existing.useCount++;
                break;
            case 'like':
                existing.likeCount++;
                break;
            case 'dislike':
                existing.dislikeCount++;
                break;
        }
        
        existing.lastAccessed = new Date();
        this.usageHistory.set(itemId, existing);
    }

    /**
     * 获取推荐统计
     */
    getRecommendationStats(): {
        totalRecommendations: number;
        averageConfidence: number;
        strategyDistribution: Record<RecommendationStrategy, number>;
        averageProcessingTime: number;
    } {
        const total = this.recommendationHistory.length;
        if (total === 0) {
            return {
                totalRecommendations: 0,
                averageConfidence: 0,
                strategyDistribution: {} as Record<RecommendationStrategy, number>,
                averageProcessingTime: 0
            };
        }
        
        const avgConfidence = this.recommendationHistory.reduce((sum, r) => sum + r.confidence, 0) / total;
        const avgProcessingTime = this.recommendationHistory.reduce((sum, r) => sum + r.metadata.processingTime, 0) / total;
        
        const strategyDistribution: Record<string, number> = {};
        this.recommendationHistory.forEach(r => {
            strategyDistribution[r.strategy] = (strategyDistribution[r.strategy] || 0) + 1;
        });
        
        return {
            totalRecommendations: total,
            averageConfidence: avgConfidence,
            strategyDistribution: strategyDistribution as Record<RecommendationStrategy, number>,
            averageProcessingTime: avgProcessingTime
        };
    }

    /**
     * 确定推荐策略
     */
    private determineStrategy(request: RecommendationRequest): RecommendationStrategy {
        if (request.query) {
            return 'semantic_search';
        } else if (request.currentContext && request.currentContext.length > 0) {
            return 'contextual';
        } else if (request.workingContext) {
            return 'content_based';
        } else {
            return 'hybrid';
        }
    }

    /**
     * 获取候选项
     */
    private async getCandidates(
        request: RecommendationRequest, 
        strategy: RecommendationStrategy
    ): Promise<ContextItem[]> {
        const candidates: ContextItem[] = [];
        
        switch (strategy) {
            case 'semantic_search':
                if (request.query) {
                    const similarItems = await this.vectorStore.findSimilar(request.query, 0.5, 50);
                    candidates.push(...similarItems.map(s => s.item));
                }
                break;
                
            case 'contextual':
                if (request.currentContext) {
                    for (const contextItem of request.currentContext) {
                        const similar = await this.vectorStore.findSimilarById(contextItem.id, 0.4, 20);
                        candidates.push(...similar.map(s => s.item));
                    }
                }
                break;
                
            case 'content_based':
            case 'hybrid':
            default:
                // 获取所有可用项目作为候选
                const allIds = this.vectorStore.getAllIds();
                for (const id of allIds.slice(0, 100)) { // 限制候选数量
                    const vectorData = this.vectorStore.getVector(id);
                    if (vectorData) {
                        candidates.push(this.createContextItemFromVector(vectorData));
                    }
                }
                break;
        }
        
        // 去重
        const uniqueCandidates = this.deduplicateItems(candidates);
        return uniqueCandidates;
    }

    /**
     * 为候选项计算分数
     */
    private async scoreItems(
        candidates: ContextItem[],
        request: RecommendationRequest,
        strategy: RecommendationStrategy
    ): Promise<RecommendedItem[]> {
        const scoredItems: RecommendedItem[] = [];
        
        for (const candidate of candidates) {
            const score = await this.calculateItemScore(candidate, request, strategy);
            const reasons = this.generateReasons(candidate, request, strategy, score);
            const relevanceFactors = this.calculateRelevanceFactors(candidate, request);
            
            scoredItems.push({
                item: candidate,
                score: score.total,
                reasons,
                relevanceFactors
            });
        }
        
        return scoredItems;
    }

    /**
     * 计算单个项目的分数
     */
    private async calculateItemScore(
        item: ContextItem,
        request: RecommendationRequest,
        strategy: RecommendationStrategy
    ): Promise<{ total: number; components: Record<string, number> }> {
        const components: Record<string, number> = {};
        
        // 语义相似度分数
        if (request.query) {
            const similarItems = await this.vectorStore.findSimilar(request.query, 0, 1);
            const similarity = similarItems.find(s => s.item.id === item.id)?.similarity || 0;
            components.semantic = similarity * 0.4;
        }
        
        // 时间相关性分数
        components.temporal = this.calculateTemporalScore(item, request) * 0.2;
        
        // 用户偏好分数
        components.preference = this.calculatePreferenceScore(item, request) * 0.2;
        
        // 使用历史分数
        components.usage = this.calculateUsageScore(item.id) * 0.1;
        
        // 内容质量分数
        components.quality = this.calculateQualityScore(item) * 0.1;
        
        const total = Object.values(components).reduce((sum, score) => sum + score, 0);
        
        return { total, components };
    }

    /**
     * 计算时间相关性分数
     */
    private calculateTemporalScore(item: ContextItem, request: RecommendationRequest): number {
        const now = new Date();
        const itemAge = now.getTime() - item.timestamp.getTime();
        const daysSinceCreation = itemAge / (1000 * 60 * 60 * 24);
        
        const timePreference = request.userPreferences?.timePreference || this.userPreferences.timePreference;
        
        switch (timePreference) {
            case 'recent':
                return Math.max(0, 1 - daysSinceCreation / 30); // 30天内的内容得分较高
            case 'historical':
                return Math.min(1, daysSinceCreation / 30); // 较老的内容得分较高
            case 'all':
            default:
                return 0.5; // 中性分数
        }
    }

    /**
     * 计算用户偏好分数
     */
    private calculatePreferenceScore(item: ContextItem, request: RecommendationRequest): number {
        const preferences = request.userPreferences || this.userPreferences;
        let score = 0;
        
        // 类型偏好
        if (preferences.preferredTypes.includes(item.type)) {
            score += 0.3;
        }
        
        // 主题兴趣（基于标题和内容的关键词匹配）
        const itemText = (item.title + ' ' + item.content).toLowerCase();
        const matchingTopics = preferences.topicInterests.filter(topic => 
            itemText.includes(topic.toLowerCase())
        );
        score += Math.min(0.4, matchingTopics.length * 0.1);
        
        // 语言偏好（对于代码内容）
        if (item.type === 'code' && item.metadata?.language) {
            if (preferences.languagePreferences.includes(item.metadata.language)) {
                score += 0.3;
            }
        }
        
        return Math.min(1, score);
    }

    /**
     * 计算使用历史分数
     */
    private calculateUsageScore(itemId: string): number {
        const usage = this.usageHistory.get(itemId);
        if (!usage) return 0;
        
        const totalInteractions = usage.viewCount + usage.useCount + usage.likeCount;
        const positiveRatio = usage.likeCount / Math.max(1, usage.likeCount + usage.dislikeCount);
        
        // 结合使用频率和正面反馈
        const frequencyScore = Math.min(1, totalInteractions / 10);
        const sentimentScore = positiveRatio;
        
        return (frequencyScore * 0.7 + sentimentScore * 0.3);
    }

    /**
     * 计算内容质量分数
     */
    private calculateQualityScore(item: ContextItem): number {
        let score = 0.5; // 基础分数
        
        // 内容长度（适中的长度得分较高）
        const contentLength = item.content.length;
        if (contentLength > 100 && contentLength < 2000) {
            score += 0.2;
        }
        
        // 是否有预览（表明内容结构良好）
        if (item.preview && item.preview.length > 0) {
            score += 0.1;
        }
        
        // 是否有元数据（表明内容信息丰富）
        if (item.metadata && Object.keys(item.metadata).length > 0) {
            score += 0.2;
        }
        
        return Math.min(1, score);
    }

    /**
     * 生成推荐原因
     */
    private generateReasons(
        item: ContextItem,
        request: RecommendationRequest,
        strategy: RecommendationStrategy,
        score: { total: number; components: Record<string, number> }
    ): RecommendationReason[] {
        const reasons: RecommendationReason[] = [];
        
        // 根据分数组件生成原因
        Object.entries(score.components).forEach(([component, value]) => {
            if (value > 0.1) { // 只显示有意义的分数组件
                let reason: RecommendationReason;
                
                switch (component) {
                    case 'semantic':
                        reason = {
                            type: 'semantic_similarity',
                            description: `与查询内容语义相似度较高 (${(value * 100).toFixed(1)}%)`,
                            weight: value,
                            evidence: '基于向量语义分析'
                        };
                        break;
                    case 'temporal':
                        reason = {
                            type: 'temporal_relevance',
                            description: `时间相关性符合偏好 (${(value * 100).toFixed(1)}%)`,
                            weight: value,
                            evidence: '基于创建时间和用户偏好'
                        };
                        break;
                    case 'preference':
                        reason = {
                            type: 'user_preference',
                            description: `符合用户偏好设置 (${(value * 100).toFixed(1)}%)`,
                            weight: value,
                            evidence: '基于用户偏好配置'
                        };
                        break;
                    case 'usage':
                        reason = {
                            type: 'collaborative_filtering',
                            description: `历史使用频率较高 (${(value * 100).toFixed(1)}%)`,
                            weight: value,
                            evidence: '基于历史使用记录'
                        };
                        break;
                    default:
                        reason = {
                            type: 'content_based',
                            description: `内容质量评分 (${(value * 100).toFixed(1)}%)`,
                            weight: value,
                            evidence: '基于内容分析'
                        };
                }
                
                reasons.push(reason);
            }
        });
        
        return reasons;
    }

    /**
     * 计算相关性因子
     */
    private calculateRelevanceFactors(item: ContextItem, request: RecommendationRequest): RelevanceFactor[] {
        const factors: RelevanceFactor[] = [];
        
        // 内容类型因子
        factors.push({
            factor: 'content_type',
            value: this.getTypeRelevance(item.type, request),
            weight: 0.2,
            description: `内容类型: ${item.type}`
        });
        
        // 新鲜度因子
        const freshness = this.calculateFreshness(item.timestamp);
        factors.push({
            factor: 'freshness',
            value: freshness,
            weight: 0.15,
            description: `内容新鲜度: ${(freshness * 100).toFixed(1)}%`
        });
        
        // 复杂度因子
        const complexity = this.calculateComplexity(item);
        factors.push({
            factor: 'complexity',
            value: complexity,
            weight: 0.1,
            description: `内容复杂度: ${complexity > 0.7 ? '高' : complexity > 0.4 ? '中' : '低'}`
        });
        
        return factors;
    }

    /**
     * 应用过滤器
     */
    private applyFilters(items: RecommendedItem[], request: RecommendationRequest): RecommendedItem[] {
        let filtered = items;
        
        // 最低分数过滤
        filtered = filtered.filter(item => item.score > 0.1);
        
        // 类型过滤
        const preferredTypes = request.userPreferences?.preferredTypes || this.userPreferences.preferredTypes;
        if (preferredTypes.length > 0) {
            filtered = filtered.filter(item => 
                preferredTypes.includes(item.item.type) || item.score > 0.7
            );
        }
        
        // 复杂度过滤
        const complexityPref = request.userPreferences?.complexityPreference || this.userPreferences.complexityPreference;
        if (complexityPref !== 'medium') {
            filtered = filtered.filter(item => {
                const complexity = this.calculateComplexity(item.item);
                switch (complexityPref) {
                    case 'simple':
                        return complexity < 0.5;
                    case 'complex':
                        return complexity > 0.6;
                    default:
                        return true;
                }
            });
        }
        
        return filtered;
    }

    /**
     * 按分数排序
     */
    private sortByScore(items: RecommendedItem[]): RecommendedItem[] {
        return items.sort((a, b) => b.score - a.score);
    }

    /**
     * 生成推荐解释
     */
    private generateExplanation(
        items: RecommendedItem[],
        strategy: RecommendationStrategy,
        request: RecommendationRequest
    ): string {
        if (items.length === 0) {
            return '未找到符合条件的推荐内容';
        }
        
        const strategyDescriptions = {
            semantic_search: '基于语义相似度',
            contextual: '基于当前上下文',
            content_based: '基于内容特征',
            collaborative_filtering: '基于协同过滤',
            hybrid: '基于混合算法',
            temporal: '基于时间相关性'
        };
        
        const avgScore = items.reduce((sum, item) => sum + item.score, 0) / items.length;
        const topReasons = items[0]?.reasons.slice(0, 2) || [];
        
        let explanation = `${strategyDescriptions[strategy]}找到 ${items.length} 个推荐内容，`;
        explanation += `平均相关度 ${(avgScore * 100).toFixed(1)}%。`;
        
        if (topReasons.length > 0) {
            explanation += ` 主要推荐原因：${topReasons.map(r => r.description).join('，')}。`;
        }
        
        return explanation;
    }

    /**
     * 计算整体置信度
     */
    private calculateOverallConfidence(items: RecommendedItem[]): number {
        if (items.length === 0) return 0;
        
        const avgScore = items.reduce((sum, item) => sum + item.score, 0) / items.length;
        const scoreVariance = this.calculateVariance(items.map(item => item.score));
        
        // 平均分数高且方差小的推荐置信度更高
        const confidenceFromScore = avgScore;
        const confidenceFromConsistency = Math.max(0, 1 - scoreVariance);
        
        return (confidenceFromScore * 0.7 + confidenceFromConsistency * 0.3);
    }

    /**
     * 获取应用的过滤器列表
     */
    private getAppliedFilters(request: RecommendationRequest): string[] {
        const filters: string[] = ['min_score'];
        
        if (request.userPreferences?.preferredTypes?.length) {
            filters.push('content_type');
        }
        
        if (request.userPreferences?.complexityPreference !== 'medium') {
            filters.push('complexity');
        }
        
        return filters;
    }

    /**
     * 获取降级推荐
     */
    private getFallbackRecommendation(request: RecommendationRequest): RecommendationResult {
        return {
            items: [],
            explanation: '推荐系统暂时不可用，请稍后重试',
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

    /**
     * 记录推荐结果
     */
    private recordRecommendation(result: RecommendationResult): void {
        this.recommendationHistory.push(result);
        
        // 限制历史记录数量
        if (this.recommendationHistory.length > 1000) {
            this.recommendationHistory = this.recommendationHistory.slice(-500);
        }
    }

    /**
     * 获取默认用户偏好
     */
    private getDefaultPreferences(): UserPreferences {
        return {
            preferredTypes: ['code', 'qa', 'json'],
            timePreference: 'recent',
            complexityPreference: 'medium',
            topicInterests: [],
            languagePreferences: ['typescript', 'javascript', 'python']
        };
    }

    /**
     * 去重项目
     */
    private deduplicateItems(items: ContextItem[]): ContextItem[] {
        const seen = new Set<string>();
        return items.filter(item => {
            if (seen.has(item.id)) {
                return false;
            }
            seen.add(item.id);
            return true;
        });
    }

    /**
     * 获取类型相关性
     */
    private getTypeRelevance(type: string, request: RecommendationRequest): number {
        const preferences = request.userPreferences || this.userPreferences;
        return preferences.preferredTypes.includes(type) ? 1 : 0.5;
    }

    /**
     * 计算新鲜度
     */
    private calculateFreshness(timestamp: Date): number {
        const now = new Date();
        const ageInDays = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
        return Math.max(0, 1 - ageInDays / 365); // 一年内的内容认为是新鲜的
    }

    /**
     * 计算复杂度
     */
    private calculateComplexity(item: ContextItem): number {
        let complexity = 0;
        
        // 基于内容长度
        const length = item.content.length;
        complexity += Math.min(0.4, length / 5000);
        
        // 基于代码复杂度（如果是代码）
        if (item.type === 'code') {
            const codeComplexity = this.calculateCodeComplexity(item.content);
            complexity += codeComplexity * 0.6;
        }
        
        return Math.min(1, complexity);
    }

    /**
     * 计算代码复杂度
     */
    private calculateCodeComplexity(code: string): number {
        let complexity = 0;
        
        // 循环和条件语句
        const controlStructures = (code.match(/\b(if|for|while|switch|try)\b/g) || []).length;
        complexity += Math.min(0.5, controlStructures / 10);
        
        // 函数定义
        const functions = (code.match(/\bfunction\b|\=\>/g) || []).length;
        complexity += Math.min(0.3, functions / 5);
        
        // 嵌套层级
        const braces = code.split('{').length - 1;
        complexity += Math.min(0.2, braces / 20);
        
        return Math.min(1, complexity);
    }

    /**
     * 计算方差
     */
    private calculateVariance(values: number[]): number {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    }

    /**
     * 从向量数据创建ContextItem
     */
    private createContextItemFromVector(vectorData: any): ContextItem {
        return {
            id: vectorData.id,
            type: vectorData.metadata?.type || 'text',
            title: vectorData.metadata?.title || '未知标题',
            content: vectorData.metadata?.content || '',
            preview: vectorData.metadata?.content?.substring(0, 100) || '',
            timestamp: vectorData.timestamp || new Date(),
            metadata: vectorData.metadata || {}
        };
    }
}

interface UsageRecord {
    itemId: string;
    viewCount: number;
    useCount: number;
    likeCount: number;
    dislikeCount: number;
    lastAccessed: Date;
    firstAccessed: Date;
}