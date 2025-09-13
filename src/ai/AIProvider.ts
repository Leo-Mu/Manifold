import fetch from 'node-fetch';

export interface AIConfig {
    provider: 'openai' | 'anthropic' | 'custom';
    apiKey: string;
    baseUrl?: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    // 新增embedding配置
    embeddingModel?: string;
    embeddingBaseUrl?: string;
    embeddingApiKey?: string;
    enableEmbedding?: boolean;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface StreamChunk {
    content: string;
    finished: boolean;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface EmbeddingResponse {
    embedding: number[];
    usage?: {
        promptTokens: number;
        totalTokens: number;
    };
}

export abstract class AIProvider {
    protected config: AIConfig;

    constructor(config: AIConfig) {
        this.config = config;
    }

    abstract chat(messages: ChatMessage[]): Promise<ChatResponse>;
    abstract chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void>;

    // 新增embedding方法
    abstract generateEmbedding(text: string): Promise<EmbeddingResponse>;

    // 检查是否支持embedding
    supportsEmbedding(): boolean {
        return Boolean(this.config.enableEmbedding) &&
            (Boolean(this.config.embeddingModel) || this.config.provider === 'openai');
    }

    protected validateConfig(): void {
        if (!this.config.apiKey) {
            throw new Error('API Key 未配置');
        }
        if (!this.config.model) {
            throw new Error('模型未配置');
        }
    }

    protected validateEmbeddingConfig(): void {
        if (!Boolean(this.config.enableEmbedding)) {
            throw new Error('Embedding 功能未启用');
        }

        const apiKey = this.config.embeddingApiKey || this.config.apiKey;
        if (!apiKey) {
            throw new Error('Embedding API Key 未配置');
        }
    }
}

export class OpenAIProvider extends AIProvider {
    async chat(messages: ChatMessage[]): Promise<ChatResponse> {
        this.validateConfig();

        const url = this.config.baseUrl || 'https://api.openai.com/v1/chat/completions';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: messages,
                temperature: this.config.temperature || 0.7,
                max_tokens: this.config.maxTokens || 2000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API 错误: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;

        return {
            content: data.choices[0].message.content,
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        };
    }

    async chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void> {
        this.validateConfig();

        const url = this.config.baseUrl || 'https://api.openai.com/v1/chat/completions';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: messages,
                temperature: this.config.temperature || 0.7,
                max_tokens: this.config.maxTokens || 2000,
                stream: true
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API 错误: ${response.status} - ${error}`);
        }

        if (!response.body) {
            throw new Error('响应体为空');
        }

        return new Promise((resolve, reject) => {
            let buffer = '';
            let isFinished = false;

            const finishStream = (usage?: any) => {
                if (isFinished) return;
                isFinished = true;

                onChunk({
                    content: '',
                    finished: true,
                    usage: usage ? {
                        promptTokens: usage.prompt_tokens,
                        completionTokens: usage.completion_tokens,
                        totalTokens: usage.total_tokens
                    } : undefined
                });
                resolve();
            };

            response.body!.on('data', (chunk: Buffer) => {
                try {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) {
                            continue;
                        }

                        const data = trimmed.slice(6);
                        if (data === '[DONE]') {
                            finishStream();
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta;

                            if (delta?.content) {
                                onChunk({
                                    content: delta.content,
                                    finished: false
                                });
                            }

                            // 检查是否完成
                            if (parsed.choices?.[0]?.finish_reason) {
                                finishStream(parsed.usage);
                                return;
                            }
                        } catch (e) {
                            console.warn('解析流数据失败:', e);
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            });

            response.body!.on('end', () => {
                finishStream();
            });

            response.body!.on('error', (error: Error) => {
                reject(error);
            });
        });
    }

    async generateEmbedding(text: string): Promise<EmbeddingResponse> {
        this.validateEmbeddingConfig();

        const embeddingModel = this.config.embeddingModel || 'text-embedding-ada-002';
        const embeddingUrl = this.config.embeddingBaseUrl || this.config.baseUrl?.replace('/chat/completions', '/embeddings') || 'https://api.openai.com/v1/embeddings';
        const apiKey = this.config.embeddingApiKey || this.config.apiKey;

        const response = await fetch(embeddingUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: embeddingModel,
                input: text
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI Embedding API 错误: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;

        return {
            embedding: data.data[0].embedding,
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        };
    }
}

export class AnthropicProvider extends AIProvider {
    async chat(messages: ChatMessage[]): Promise<ChatResponse> {
        this.validateConfig();

        const url = this.config.baseUrl || 'https://api.anthropic.com/v1/messages';

        // 转换消息格式，Anthropic 需要分离 system 消息
        const systemMessage = messages.find(m => m.role === 'system');
        const conversationMessages = messages.filter(m => m.role !== 'system');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens || 2000,
                system: systemMessage?.content,
                messages: conversationMessages
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API 错误: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;

        return {
            content: data.content[0].text,
            usage: data.usage ? {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens
            } : undefined
        };
    }

    async chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void> {
        this.validateConfig();

        const url = this.config.baseUrl || 'https://api.anthropic.com/v1/messages';

        // 转换消息格式，Anthropic 需要分离 system 消息
        const systemMessage = messages.find(m => m.role === 'system');
        const conversationMessages = messages.filter(m => m.role !== 'system');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.config.model,
                max_tokens: this.config.maxTokens || 2000,
                system: systemMessage?.content,
                messages: conversationMessages,
                stream: true
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API 错误: ${response.status} - ${error}`);
        }

        if (!response.body) {
            throw new Error('响应体为空');
        }

        return new Promise((resolve, reject) => {
            let buffer = '';
            let isFinished = false;

            const finishStream = (usage?: any) => {
                if (isFinished) return;
                isFinished = true;

                onChunk({
                    content: '',
                    finished: true,
                    usage: usage ? {
                        promptTokens: usage.input_tokens,
                        completionTokens: usage.output_tokens,
                        totalTokens: usage.input_tokens + usage.output_tokens
                    } : undefined
                });
                resolve();
            };

            response.body!.on('data', (chunk: Buffer) => {
                try {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) {
                            continue;
                        }

                        const data = trimmed.slice(6);

                        try {
                            const parsed = JSON.parse(data);

                            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                                onChunk({
                                    content: parsed.delta.text,
                                    finished: false
                                });
                            } else if (parsed.type === 'message_stop') {
                                finishStream(parsed.usage);
                                return;
                            }
                        } catch (e) {
                            console.warn('解析Anthropic流数据失败:', e);
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            });

            response.body!.on('end', () => {
                finishStream();
            });

            response.body!.on('error', (error: Error) => {
                reject(error);
            });
        });
    }

    async generateEmbedding(text: string): Promise<EmbeddingResponse> {
        // Anthropic 目前不直接支持 embedding，使用 OpenAI 兼容的 embedding 服务
        this.validateEmbeddingConfig();

        const embeddingModel = this.config.embeddingModel || 'text-embedding-ada-002';
        const embeddingUrl = this.config.embeddingBaseUrl || 'https://api.openai.com/v1/embeddings';
        const apiKey = this.config.embeddingApiKey || this.config.apiKey;

        const response = await fetch(embeddingUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: embeddingModel,
                input: text
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Embedding API 错误: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;

        return {
            embedding: data.data[0].embedding,
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        };
    }
}

export class CustomProvider extends AIProvider {
    async chat(messages: ChatMessage[]): Promise<ChatResponse> {
        this.validateConfig();

        if (!this.config.baseUrl) {
            throw new Error('自定义提供商需要配置 baseUrl');
        }

        const response = await fetch(this.config.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: messages,
                temperature: this.config.temperature || 0.7,
                max_tokens: this.config.maxTokens || 2000
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`自定义 API 错误: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;

        // 尝试兼容 OpenAI 格式
        if (data.choices && data.choices[0]) {
            return {
                content: data.choices[0].message.content,
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined
            };
        }

        // 如果不是标准格式，尝试直接返回内容
        return {
            content: data.content || data.response || JSON.stringify(data)
        };
    }

    async chatStream(messages: ChatMessage[], onChunk: (chunk: StreamChunk) => void): Promise<void> {
        this.validateConfig();

        if (!this.config.baseUrl) {
            throw new Error('自定义提供商需要配置 baseUrl');
        }

        const response = await fetch(this.config.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: messages,
                temperature: this.config.temperature || 0.7,
                max_tokens: this.config.maxTokens || 2000,
                stream: true
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`自定义 API 错误: ${response.status} - ${error}`);
        }

        if (!response.body) {
            throw new Error('响应体为空');
        }

        return new Promise((resolve, reject) => {
            let buffer = '';
            let isFinished = false;

            const finishStream = (usage?: any) => {
                if (isFinished) return;
                isFinished = true;

                onChunk({
                    content: '',
                    finished: true,
                    usage: usage ? {
                        promptTokens: usage.prompt_tokens,
                        completionTokens: usage.completion_tokens,
                        totalTokens: usage.total_tokens
                    } : undefined
                });
                resolve();
            };

            response.body!.on('data', (chunk: Buffer) => {
                try {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) {
                            continue;
                        }

                        const data = trimmed.slice(6);
                        if (data === '[DONE]') {
                            finishStream();
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);

                            // 尝试兼容 OpenAI 格式
                            const delta = parsed.choices?.[0]?.delta;
                            if (delta?.content) {
                                onChunk({
                                    content: delta.content,
                                    finished: false
                                });
                            }

                            // 检查是否完成
                            if (parsed.choices?.[0]?.finish_reason) {
                                finishStream(parsed.usage);
                                return;
                            }
                        } catch (e) {
                            console.warn('解析自定义API流数据失败:', e);
                        }
                    }
                } catch (error) {
                    reject(error);
                }
            });

            response.body!.on('end', () => {
                finishStream();
            });

            response.body!.on('error', (error: Error) => {
                reject(error);
            });
        });
    }

    async generateEmbedding(text: string): Promise<EmbeddingResponse> {
        this.validateEmbeddingConfig();

        if (!this.config.baseUrl) {
            throw new Error('自定义提供商需要配置 baseUrl');
        }

        const embeddingModel = this.config.embeddingModel || 'text-embedding-ada-002';
        const embeddingUrl = this.config.embeddingBaseUrl || this.config.baseUrl.replace('/chat/completions', '/embeddings');
        const apiKey = this.config.embeddingApiKey || this.config.apiKey;

        const response = await fetch(embeddingUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: embeddingModel,
                input: text
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`自定义 Embedding API 错误: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;

        // 尝试兼容 OpenAI 格式
        if (data.data && data.data[0] && data.data[0].embedding) {
            return {
                embedding: data.data[0].embedding,
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined
            };
        }

        // 如果不是标准格式，尝试直接返回
        return {
            embedding: data.embedding || data
        };
    }
}

export function createAIProvider(config: AIConfig): AIProvider {
    switch (config.provider) {
        case 'openai':
            return new OpenAIProvider(config);
        case 'anthropic':
            return new AnthropicProvider(config);
        case 'custom':
            return new CustomProvider(config);
        default:
            throw new Error(`不支持的 AI 提供商: ${config.provider}`);
    }
}