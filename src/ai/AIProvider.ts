import fetch from 'node-fetch';

export interface AIConfig {
    provider: 'openai' | 'anthropic' | 'custom';
    apiKey: string;
    baseUrl?: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
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

export abstract class AIProvider {
    protected config: AIConfig;

    constructor(config: AIConfig) {
        this.config = config;
    }

    abstract chat(messages: ChatMessage[]): Promise<ChatResponse>;
    
    protected validateConfig(): void {
        if (!this.config.apiKey) {
            throw new Error('API Key 未配置');
        }
        if (!this.config.model) {
            throw new Error('模型未配置');
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