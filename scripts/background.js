import { config, getConfig } from './config.js';

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeContent') {
        const forceRefresh = request.forceRefresh || false;
        analyzeContent(request.content, forceRefresh)
            .then(result => sendResponse(result))
            .catch(error => {
                console.error('完整错误信息:', error);
                sendResponse({ 
                    error: {
                        message: error.message,
                        details: error.details || '未知错误'
                    }
                });
            });
        return true; // 保持消息通道打开以支持异步响应
    }
});

// 缓存配置
const CACHE_CONFIG = {
    MAX_AGE_MS: 24 * 60 * 60 * 1000, // 缓存24小时
    MAX_ITEMS: 100 // 最多缓存100条
};

// 获取缓存的摘要
async function getCachedSummary(url) {
    try {
        const result = await chrome.storage.local.get([url, 'cache_metadata']);
        const metadata = result.cache_metadata || {};
        
        // 检查缓存是否存在且未过期
        if (result[url] && metadata[url]) {
            const cacheAge = Date.now() - metadata[url].timestamp;
            if (cacheAge < CACHE_CONFIG.MAX_AGE_MS) {
                console.log('使用缓存的摘要，缓存年龄:', Math.round(cacheAge / 1000 / 60), '分钟');
                return result[url];
            } else {
                console.log('缓存已过期');
                // 删除过期缓存
                await chrome.storage.local.remove([url]);
                delete metadata[url];
                await chrome.storage.local.set({ cache_metadata: metadata });
            }
        }
        return null;
    } catch (error) {
        console.error('获取缓存失败:', error);
        return null;
    }
}

// 保存摘要到缓存
async function saveSummaryToCache(url, summary, model) {
    try {
        // 获取当前缓存元数据
        const { cache_metadata = {} } = await chrome.storage.local.get('cache_metadata');
        
        // 如果缓存项数量超过限制，删除最旧的缓存
        const cacheEntries = Object.entries(cache_metadata);
        if (cacheEntries.length >= CACHE_CONFIG.MAX_ITEMS) {
            // 按时间戳排序
            cacheEntries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
            // 删除最旧的10%的缓存
            const itemsToRemove = Math.ceil(CACHE_CONFIG.MAX_ITEMS * 0.1);
            const keysToRemove = cacheEntries.slice(0, itemsToRemove).map(([key]) => key);
            
            // 删除旧缓存
            await chrome.storage.local.remove(keysToRemove);
            keysToRemove.forEach(key => delete cache_metadata[key]);
            console.log('已删除', itemsToRemove, '条旧缓存');
        }

        // 更新缓存元数据
        cache_metadata[url] = {
            timestamp: Date.now(),
            title: summary.substring(0, 100), // 保存摘要的前100个字符作为标题
            model: model // 保存使用的模型信息
        };

        // 保存新的缓存和元数据
        await Promise.all([
            chrome.storage.local.set({ [url]: summary }),
            chrome.storage.local.set({ cache_metadata })
        ]);
        
        console.log('保存缓存成功:', url);
    } catch (error) {
        console.error('保存缓存失败:', error);
    }
}

// 添加性能监控工具
const PerformanceMonitor = {
    startTime: null,
    checkpoints: {},

    start() {
        this.startTime = performance.now();
        this.checkpoints = {};
        return this.startTime;
    },

    checkpoint(name) {
        const time = performance.now();
        const elapsed = time - this.startTime;
        this.checkpoints[name] = elapsed;
        console.log(`[性能监控] ${name}: ${elapsed.toFixed(2)}ms`);
        return elapsed;
    },

    summary() {
        console.log('========== 性能监控总结 ==========');
        let lastTime = this.startTime;
        Object.entries(this.checkpoints).forEach(([name, time]) => {
            const stepTime = time - (lastTime === this.startTime ? 0 : this.checkpoints[Object.keys(this.checkpoints)[Object.keys(this.checkpoints).indexOf(name) - 1]]);
            console.log(`${name}:
    - 总耗时: ${time.toFixed(2)}ms
    - 步骤耗时: ${stepTime.toFixed(2)}ms`);
            lastTime = time;
        });
        console.log('================================');
    }
};

// 调用SiliconFlow API
async function callSiliconFlow(prompt) {
    const monitor = PerformanceMonitor;
    monitor.start();
    console.log('准备调用SiliconFlow API...');
    
    try {
        // 获取最新配置
        const currentConfig = await getConfig();
        monitor.checkpoint('获取配置');
        
        if (!currentConfig.SILICONFLOW_API_KEY) {
            throw new Error('请先在选项页面设置SiliconFlow API密钥');
        }

        const requestBody = {
            model: currentConfig.MODEL || 'deepseek-ai/DeepSeek-V3',
            messages: [
                {
                    role: "system",
                    content: "You are a professional article analysis assistant, good at extracting key points and generating structured data. Please ensure the output format strictly meets the requirements."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: currentConfig.MAX_TOKENS || 512,
            temperature: currentConfig.TEMPERATURE || 0.7,
            top_p: currentConfig.TOP_P || 0.7,
            top_k: currentConfig.TOP_K || 50,
            frequency_penalty: currentConfig.FREQUENCY_PENALTY || 0.5,
            presence_penalty: currentConfig.PRESENCE_PENALTY || 0,
            response_format: {
                type: "text"
            },
            stream: true
        };

        monitor.checkpoint('准备请求参数');
        console.log('API请求参数:', JSON.stringify(requestBody, null, 2));
        console.log('使用API密钥:', currentConfig.SILICONFLOW_API_KEY.substring(0, 5) + '...');

        const response = await fetch(currentConfig.SILICONFLOW_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentConfig.SILICONFLOW_API_KEY}`,
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(requestBody)
        });

        monitor.checkpoint('获得首次响应');

        if (!response.ok) {
            let errorMessage = 'API调用失败';
            if (response.status === 401 || response.status === 403) {
                errorMessage = 'API密钥无效或已过期';
            } else {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || '未知错误';
            }
            throw new Error(errorMessage);
        }

        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';
        let chunkCount = 0;
        let lastChunkTime = Date.now();

        console.log('开始处理流式响应...');
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                console.log('流式响应结束，最终内容长度:', fullContent.length);
                break;
            }
            
            const now = Date.now();
            const chunkInterval = now - lastChunkTime;
            lastChunkTime = now;
            chunkCount++;
            
            const chunk = decoder.decode(value, { stream: true });
            console.log(`收到第 ${chunkCount} 个数据块:`, chunk);
            
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.trim() === 'data: [DONE]') {
                    console.log('收到结束标记 [DONE]');
                    break;
                }
                
                try {
                    if (line.startsWith('data: ')) {
                        const jsonData = JSON.parse(line.slice(6));
                        console.log('解析的JSON数据:', jsonData);
                        
                        // 处理不同的响应格式
                        let content = '';
                        if (jsonData.choices && jsonData.choices[0]) {
                            if (jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                                content = jsonData.choices[0].delta.content;
                            } else if (jsonData.choices[0].content) {
                                content = jsonData.choices[0].content;
                            } else if (jsonData.choices[0].text) {
                                content = jsonData.choices[0].text;
                            }
                        }

                        if (content) {
                            console.log('提取的内容:', content);
                            fullContent += content;
                            
                            try {
                                // 发送进度更新消息
                                await new Promise((resolve, reject) => {
                                    chrome.runtime.sendMessage({
                                        action: 'streamUpdate',
                                        content: fullContent,
                                        stats: {
                                            totalTime: performance.now() - monitor.startTime
                                        },
                                        model: currentConfig.MODEL || 'deepseek-ai/DeepSeek-V3'
                                    }, response => {
                                        if (chrome.runtime.lastError) {
                                            console.error('发送消息失败:', chrome.runtime.lastError);
                                            reject(chrome.runtime.lastError);
                                        } else {
                                            console.log('成功发送更新消息，当前内容长度:', fullContent.length);
                                            resolve();
                                        }
                                    });
                                });
                            } catch (error) {
                                console.error('发送更新消息时出错:', error);
                                // 继续处理，不中断流式响应
                            }
                        } else {
                            console.log('数据块中没有内容');
                        }
                    } else {
                        console.log('非data前缀的行:', line);
                    }
                } catch (e) {
                    console.error('解析流数据出错:', e, '原始数据:', line);
                }
            }
        }

        if (!fullContent) {
            throw new Error('未能获取到有效的响应内容');
        }

        console.log('流式响应处理完成，最终内容:', fullContent);
        monitor.checkpoint('完成流式响应');
        monitor.summary();

        return fullContent;
    } catch (error) {
        monitor.checkpoint('发生错误');
        monitor.summary();
        console.error('API调用详细错误:', error);
        error.details = `API调用详情: ${error.message}`;
        throw error;
    }
}

// 生成文本总结
async function generateSummary(content) {
    // 获取配置
    const currentConfig = await getConfig();
    
    // 构建基础prompt
    const basePrompt = currentConfig.DEFAULT_PROMPT;
    
    // 如果有自定义prompt，则添加到基础prompt后
    const customPrompt = currentConfig.CUSTOM_PROMPT ? `

用户自定义要求：
${currentConfig.CUSTOM_PROMPT}` : '';

    const prompt = `${basePrompt}${customPrompt}

文章标题：${content.title || '无标题'}
文章内容：
${content.text || '无内容'}`;

    const response = await callSiliconFlow(prompt);
    return response;
}

// 分析内容并生成摘要
async function analyzeContent(content, forceRefresh = false) {
    const monitor = PerformanceMonitor;
    monitor.start();
    
    try {
        console.log('开始内容分析:', content);
        
        // 获取最新配置
        const currentConfig = await getConfig();
        monitor.checkpoint('获取配置');
        
        if (!currentConfig.SILICONFLOW_API_KEY) {
            throw new Error('请先在选项页面设置SiliconFlow API密钥');
        }
        
        // 如果不是强制刷新，先尝试获取缓存
        if (!forceRefresh && content.url) {
            const result = await chrome.storage.local.get([content.url, 'cache_metadata']);
            const metadata = result.cache_metadata || {};
            const cachedSummary = await getCachedSummary(content.url);
            
            if (cachedSummary && metadata[content.url]) {
                monitor.checkpoint('从缓存加载');
                console.log('使用缓存的摘要');
                
                // 通过流式更新发送缓存内容
                await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'streamUpdate',
                        content: cachedSummary,
                        stats: {
                            totalTime: performance.now() - monitor.startTime
                        },
                        model: metadata[content.url].model || 'Unknown Model' // 使用缓存中保存的模型信息
                    }, response => {
                        if (chrome.runtime.lastError) {
                            console.error('发送缓存内容失败:', chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });

                monitor.summary();
                return {
                    summary: cachedSummary,
                    fromCache: true,
                    stats: {
                        totalTime: performance.now() - monitor.startTime
                    }
                };
            }
            monitor.checkpoint('缓存未命中');
        }

        // 生成文本总结
        console.log('生成文本总结...');
        const summary = await generateSummary(content);
        monitor.checkpoint('生成总结');

        // 保存到缓存
        if (content.url) {
            await saveSummaryToCache(content.url, summary, currentConfig.MODEL || 'deepseek-ai/DeepSeek-V3');
            monitor.checkpoint('保存缓存');
        }

        monitor.summary();
        return {
            summary,
            fromCache: false,
            stats: {
                totalTime: monitor.checkpoint('完成所有操作')
            }
        };
    } catch (error) {
        monitor.checkpoint('发生错误');
        monitor.summary();
        console.error('AI分析失败:', error);
        error.details = `分析失败的内容: ${JSON.stringify(content).substring(0, 100)}...`;
        throw error;
    }
} 