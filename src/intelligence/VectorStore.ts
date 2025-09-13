import { ContextItem } from '../types/ContextTypes';
import { AIProvider } from '../ai/AIProvider';

export interface VectorData {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
    timestamp: Date;
}

export interface SimilarityResult {
    item: ContextItem;
    similarity: number;
    vector: number[];
}

export interface ClusterResult {
    clusterId: string;
    items: ContextItem[];
    centroid: number[];
    coherence: number;
}

export class VectorStore {
    private vectors: Map<string, VectorData> = new Map();
    private aiProvider: AIProvider;
    private embeddingCache: Map<string, number[]> = new Map();
    private readonly VECTOR_DIMENSION = 1536; // OpenAI embedding dimension
    private readonly SIMILARITY_THRESHOLD = 0.7;

    constructor(aiProvider: AIProvider) {
        this.aiProvider = aiProvider;
    }

    /**
     * 为内容生成向量嵌入
     */
    async embedContent(content: string): Promise<number[]> {
        const cacheKey = this.generateCacheKey(content);
        
        // 检查缓存
        if (this.embeddingCache.has(cacheKey)) {
            return this.embeddingCache.get(cacheKey)!;
        }

        try {
            // 尝试使用AI提供商生成嵌入
            const vector = await this.generateEmbedding(content);
            
            // 缓存结果
            this.embeddingCache.set(cacheKey, vector);
            
            return vector;
        } catch (error) {
            console.warn('AI嵌入生成失败，使用本地方法:', error);
            // 降级到本地嵌入方法
            const vector = this.generateLocalEmbedding(content);
            this.embeddingCache.set(cacheKey, vector);
            return vector;
        }
    }

    /**
     * 存储向量数据
     */
    async storeVector(id: string, content: string, metadata: Record<string, any> = {}): Promise<void> {
        const vector = await this.embedContent(content);
        
        const vectorData: VectorData = {
            id,
            vector,
            metadata: {
                ...metadata,
                content: content.substring(0, 500), // 存储内容摘要
                contentLength: content.length
            },
            timestamp: new Date()
        };
        
        this.vectors.set(id, vectorData);
    }

    /**
     * 批量存储向量
     */
    async storeBatch(items: ContextItem[]): Promise<void> {
        const batchSize = 5; // 限制并发数
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const promises = batch.map(item => 
                this.storeVector(item.id, item.content, {
                    type: item.type,
                    title: item.title,
                    timestamp: item.timestamp
                })
            );
            
            await Promise.all(promises);
        }
    }

    /**
     * 查找相似内容
     */
    async findSimilar(
        queryContent: string, 
        threshold: number = this.SIMILARITY_THRESHOLD,
        limit: number = 10
    ): Promise<SimilarityResult[]> {
        const queryVector = await this.embedContent(queryContent);
        
        const similarities: Array<{ id: string; similarity: number; vector: number[] }> = [];
        
        for (const [id, vectorData] of this.vectors) {
            const similarity = this.calculateCosineSimilarity(queryVector, vectorData.vector);
            
            if (similarity >= threshold) {
                similarities.push({
                    id,
                    similarity,
                    vector: vectorData.vector
                });
            }
        }
        
        // 按相似度排序
        similarities.sort((a, b) => b.similarity - a.similarity);
        
        // 限制结果数量
        const topSimilarities = similarities.slice(0, limit);
        
        // 转换为结果格式（这里需要从外部获取ContextItem，暂时返回基础信息）
        return topSimilarities.map(sim => ({
            item: this.createContextItemFromVector(sim.id),
            similarity: sim.similarity,
            vector: sim.vector
        }));
    }

    /**
     * 查找指定ID的相似内容
     */
    async findSimilarById(
        id: string, 
        threshold: number = this.SIMILARITY_THRESHOLD,
        limit: number = 10
    ): Promise<SimilarityResult[]> {
        const vectorData = this.vectors.get(id);
        if (!vectorData) {
            throw new Error(`向量数据不存在: ${id}`);
        }

        const similarities: Array<{ id: string; similarity: number; vector: number[] }> = [];
        
        for (const [otherId, otherVectorData] of this.vectors) {
            if (otherId === id) continue; // 跳过自己
            
            const similarity = this.calculateCosineSimilarity(vectorData.vector, otherVectorData.vector);
            
            if (similarity >= threshold) {
                similarities.push({
                    id: otherId,
                    similarity,
                    vector: otherVectorData.vector
                });
            }
        }
        
        // 按相似度排序并限制结果
        similarities.sort((a, b) => b.similarity - a.similarity);
        const topSimilarities = similarities.slice(0, limit);
        
        return topSimilarities.map(sim => ({
            item: this.createContextItemFromVector(sim.id),
            similarity: sim.similarity,
            vector: sim.vector
        }));
    }

    /**
     * 执行聚类分析
     */
    async performClustering(k: number = 5): Promise<ClusterResult[]> {
        const vectorList = Array.from(this.vectors.values());
        
        if (vectorList.length < k) {
            // 如果数据点少于聚类数，每个点自成一类
            return vectorList.map((vectorData, index) => ({
                clusterId: `cluster-${index}`,
                items: [this.createContextItemFromVector(vectorData.id)],
                centroid: vectorData.vector,
                coherence: 1.0
            }));
        }

        // 使用K-means聚类
        const clusters = this.kMeansClustering(vectorList, k);
        
        return clusters.map((cluster, index) => ({
            clusterId: `cluster-${index}`,
            items: cluster.points.map(point => this.createContextItemFromVector(point.id)),
            centroid: cluster.centroid,
            coherence: this.calculateClusterCoherence(cluster.points, cluster.centroid)
        }));
    }

    /**
     * 更新向量数据
     */
    async updateVector(id: string, content: string, metadata: Record<string, any> = {}): Promise<void> {
        await this.storeVector(id, content, metadata);
    }

    /**
     * 删除向量数据
     */
    deleteVector(id: string): boolean {
        return this.vectors.delete(id);
    }

    /**
     * 获取向量数据
     */
    getVector(id: string): VectorData | undefined {
        return this.vectors.get(id);
    }

    /**
     * 获取所有向量ID
     */
    getAllIds(): string[] {
        return Array.from(this.vectors.keys());
    }

    /**
     * 获取存储统计信息
     */
    getStats(): {
        totalVectors: number;
        cacheSize: number;
        memoryUsage: number;
        oldestVector: Date | null;
        newestVector: Date | null;
    } {
        const timestamps = Array.from(this.vectors.values()).map(v => v.timestamp);
        
        return {
            totalVectors: this.vectors.size,
            cacheSize: this.embeddingCache.size,
            memoryUsage: this.estimateMemoryUsage(),
            oldestVector: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : null,
            newestVector: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : null
        };
    }

    /**
     * 清理缓存
     */
    clearCache(): void {
        this.embeddingCache.clear();
    }

    /**
     * 清理所有数据
     */
    clear(): void {
        this.vectors.clear();
        this.embeddingCache.clear();
    }

    /**
     * 使用AI提供商生成嵌入向量
     */
    private async generateEmbedding(content: string): Promise<number[]> {
        try {
            // 检查AI提供商是否支持embedding
            if (this.aiProvider.supportsEmbedding()) {
                const response = await this.aiProvider.generateEmbedding(content.substring(0, 8000)); // 限制长度
                return response.embedding;
            } else {
                console.warn('AI提供商不支持embedding，使用本地方法');
                return this.generateLocalEmbedding(content);
            }
        } catch (error) {
            console.warn('AI嵌入生成失败，使用本地方法:', error);
            return this.generateLocalEmbedding(content);
        }
    }

    /**
     * 生成本地嵌入向量（简化实现）
     */
    private generateLocalEmbedding(content: string): number[] {
        // 这是一个简化的本地嵌入实现
        // 在实际应用中，应该使用更复杂的算法或预训练模型
        
        const vector = new Array(this.VECTOR_DIMENSION).fill(0);
        const words = content.toLowerCase().split(/\s+/);
        
        // 基于词频和位置生成简单的向量表示
        words.forEach((word, index) => {
            const hash = this.simpleHash(word);
            const position = index / words.length;
            
            for (let i = 0; i < this.VECTOR_DIMENSION; i++) {
                const feature = (hash + i) % this.VECTOR_DIMENSION;
                vector[feature] += Math.sin(position * Math.PI + i) * (1 / Math.sqrt(words.length));
            }
        });
        
        // 归一化向量
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= magnitude;
            }
        }
        
        return vector;
    }

    /**
     * 计算余弦相似度
     */
    private calculateCosineSimilarity(vector1: number[], vector2: number[]): number {
        if (vector1.length !== vector2.length) {
            throw new Error('向量维度不匹配');
        }
        
        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;
        
        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i];
            magnitude1 += vector1[i] * vector1[i];
            magnitude2 += vector2[i] * vector2[i];
        }
        
        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);
        
        if (magnitude1 === 0 || magnitude2 === 0) {
            return 0;
        }
        
        return dotProduct / (magnitude1 * magnitude2);
    }

    /**
     * K-means聚类算法
     */
    private kMeansClustering(vectors: VectorData[], k: number): Array<{
        centroid: number[];
        points: VectorData[];
    }> {
        // 初始化聚类中心
        const centroids: number[][] = [];
        for (let i = 0; i < k; i++) {
            const randomIndex = Math.floor(Math.random() * vectors.length);
            centroids.push([...vectors[randomIndex].vector]);
        }
        
        let clusters: Array<{ centroid: number[]; points: VectorData[] }> = [];
        let converged = false;
        let iterations = 0;
        const maxIterations = 100;
        
        while (!converged && iterations < maxIterations) {
            // 初始化聚类
            clusters = centroids.map(centroid => ({
                centroid: [...centroid],
                points: []
            }));
            
            // 分配点到最近的聚类中心
            for (const vector of vectors) {
                let bestClusterIndex = 0;
                let bestDistance = Infinity;
                
                for (let i = 0; i < centroids.length; i++) {
                    const distance = this.calculateEuclideanDistance(vector.vector, centroids[i]);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestClusterIndex = i;
                    }
                }
                
                clusters[bestClusterIndex].points.push(vector);
            }
            
            // 更新聚类中心
            converged = true;
            for (let i = 0; i < clusters.length; i++) {
                if (clusters[i].points.length === 0) continue;
                
                const newCentroid = this.calculateCentroid(clusters[i].points.map(p => p.vector));
                
                // 检查是否收敛
                const distance = this.calculateEuclideanDistance(centroids[i], newCentroid);
                if (distance > 0.001) {
                    converged = false;
                }
                
                centroids[i] = newCentroid;
                clusters[i].centroid = newCentroid;
            }
            
            iterations++;
        }
        
        return clusters;
    }

    /**
     * 计算欧几里得距离
     */
    private calculateEuclideanDistance(vector1: number[], vector2: number[]): number {
        let sum = 0;
        for (let i = 0; i < vector1.length; i++) {
            sum += Math.pow(vector1[i] - vector2[i], 2);
        }
        return Math.sqrt(sum);
    }

    /**
     * 计算质心
     */
    private calculateCentroid(vectors: number[][]): number[] {
        if (vectors.length === 0) return new Array(this.VECTOR_DIMENSION).fill(0);
        
        const centroid = new Array(this.VECTOR_DIMENSION).fill(0);
        
        for (const vector of vectors) {
            for (let i = 0; i < vector.length; i++) {
                centroid[i] += vector[i];
            }
        }
        
        for (let i = 0; i < centroid.length; i++) {
            centroid[i] /= vectors.length;
        }
        
        return centroid;
    }

    /**
     * 计算聚类一致性
     */
    private calculateClusterCoherence(points: VectorData[], centroid: number[]): number {
        if (points.length === 0) return 0;
        
        let totalDistance = 0;
        for (const point of points) {
            totalDistance += this.calculateEuclideanDistance(point.vector, centroid);
        }
        
        const averageDistance = totalDistance / points.length;
        
        // 将距离转换为一致性分数（距离越小，一致性越高）
        return Math.max(0, 1 - averageDistance);
    }

    /**
     * 简单哈希函数
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash);
    }

    /**
     * 生成缓存键
     */
    private generateCacheKey(content: string): string {
        return this.simpleHash(content).toString(36);
    }

    /**
     * 估算内存使用量
     */
    private estimateMemoryUsage(): number {
        const vectorSize = this.VECTOR_DIMENSION * 8; // 每个浮点数8字节
        const metadataSize = 1024; // 估算元数据大小
        const totalVectorMemory = this.vectors.size * (vectorSize + metadataSize);
        
        const cacheMemory = this.embeddingCache.size * vectorSize;
        
        return totalVectorMemory + cacheMemory;
    }

    /**
     * 从向量数据创建ContextItem（临时实现）
     */
    private createContextItemFromVector(id: string): ContextItem {
        const vectorData = this.vectors.get(id);
        if (!vectorData) {
            throw new Error(`向量数据不存在: ${id}`);
        }
        
        return {
            id,
            type: vectorData.metadata.type || 'text',
            title: vectorData.metadata.title || '未知标题',
            content: vectorData.metadata.content || '',
            preview: vectorData.metadata.content?.substring(0, 100) || '',
            timestamp: vectorData.timestamp,
            metadata: vectorData.metadata
        };
    }
}