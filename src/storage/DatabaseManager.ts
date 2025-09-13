import * as lowdb from 'lowdb';
import * as FileSync from 'lowdb/adapters/FileSync';
import * as path from 'path';
import * as fs from 'fs';
import { ContextItem } from '../types/ContextTypes';

interface DatabaseSchema {
    contexts: ContextItem[];
}

export class DatabaseManager {
    private db: lowdb.LowdbSync<DatabaseSchema> | null = null;
    private dbPath: string;

    constructor(storagePath: string) {
        // 确保存储目录存在
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.dbPath = path.join(storagePath, 'vibe-context.json');
    }

    async initialize(): Promise<void> {
        const adapter = new FileSync<DatabaseSchema>(this.dbPath);
        this.db = lowdb(adapter);
        
        // 设置默认数据
        this.db.defaults({ contexts: [] }).write();
    }

    async insertContext(context: ContextItem): Promise<void> {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        // 检查是否已存在相同ID的记录
        const existing = this.db.get('contexts').find({ id: context.id }).value();
        
        if (existing) {
            // 更新现有记录
            this.db.get('contexts').find({ id: context.id }).assign(context).write();
        } else {
            // 添加新记录
            this.db.get('contexts').push(context).write();
        }
    }

    async getRecentContexts(limit: number): Promise<ContextItem[]> {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        return this.db.get('contexts')
            .orderBy(['timestamp'], ['desc'])
            .take(limit)
            .value()
            .map(this.normalizeContext);
    }

    async getContextsByIds(ids: string[]): Promise<ContextItem[]> {
        if (ids.length === 0) {
            return [];
        }

        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        return this.db.get('contexts')
            .filter((context: ContextItem) => ids.includes(context.id))
            .value()
            .map(this.normalizeContext);
    }

    async searchContexts(query: string): Promise<ContextItem[]> {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        const searchTerm = query.toLowerCase();
        
        return this.db.get('contexts')
            .filter((context: ContextItem) => 
                context.title.toLowerCase().includes(searchTerm) ||
                context.content.toLowerCase().includes(searchTerm)
            )
            .orderBy(['timestamp'], ['desc'])
            .take(50)
            .value()
            .map(this.normalizeContext);
    }

    async deleteContext(id: string): Promise<void> {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        this.db.get('contexts').remove({ id }).write();
    }

    private normalizeContext(context: any): ContextItem {
        return {
            id: context.id,
            type: context.type,
            title: context.title,
            content: context.content,
            preview: context.preview,
            timestamp: typeof context.timestamp === 'string' ? new Date(context.timestamp) : context.timestamp,
            metadata: context.metadata || {}
        };
    }

    async close(): Promise<void> {
        // lowdb 不需要显式关闭
        this.db = null;
    }
}