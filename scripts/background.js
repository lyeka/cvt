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

// 获取缓存的摘要
async function getCachedSummary(url) {
    try {
        const result = await chrome.storage.local.get(url);
        return result[url];
    } catch (error) {
        console.error('获取缓存失败:', error);
        return null;
    }
}

// 保存摘要到缓存
async function saveSummaryToCache(url, summary) {
    try {
        await chrome.storage.local.set({ [url]: summary });
        console.log('保存缓存成功:', url);
    } catch (error) {
        console.error('保存缓存失败:', error);
    }
}

// 调用SiliconFlow API
async function callSiliconFlow(prompt) {
    console.log('准备调用SiliconFlow API...');
    try {
        // 获取最新配置
        const currentConfig = await getConfig();
        
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
            stream: false
        };

        console.log('API request parameters:', JSON.stringify(requestBody, null, 2));
        console.log('Using API key:', currentConfig.SILICONFLOW_API_KEY.substring(0, 5) + '...');

        const response = await fetch(currentConfig.SILICONFLOW_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentConfig.SILICONFLOW_API_KEY}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('API response status:', response.status);
        const responseData = await response.json();
        console.log('API response data:', responseData);

        if (!response.ok) {
            let errorMessage = 'API call failed';
            if (response.status === 401 || response.status === 403) {
                errorMessage = 'Invalid or expired API key';
            } else if (responseData.error?.message) {
                errorMessage = responseData.error.message;
            } else if (responseData.error?.code) {
                errorMessage = `Error code: ${responseData.error.code}, Message: ${responseData.error.message || 'Unknown error'}`;
            }
            throw new Error(errorMessage);
        }

        if (!responseData.choices || !responseData.choices[0]?.message?.content) {
            throw new Error('Invalid API response format');
        }

        return responseData.choices[0].message.content;
    } catch (error) {
        console.error('API call failed:', error);
        error.details = `API call details: ${error.message}`;
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
    try {
        console.log('Starting content analysis:', content);
        
        // 如果不是强制刷新，先尝试获取缓存
        if (!forceRefresh && content.url) {
            const cachedSummary = await getCachedSummary(content.url);
            if (cachedSummary) {
                console.log('使用缓存的摘要');
                return {
                    summary: cachedSummary,
                    fromCache: true
                };
            }
        }

        // 获取最新配置
        const currentConfig = await getConfig();
        if (!currentConfig.SILICONFLOW_API_KEY) {
            throw new Error('请先在选项页面设置SiliconFlow API密钥');
        }

        // 生成文本总结
        console.log('Generating text summary...');
        const summary = await generateSummary(content);
        console.log('Text summary completed');

        // 保存到缓存
        if (content.url) {
            await saveSummaryToCache(content.url, summary);
        }

        return {
            summary,
            fromCache: false
        };
    } catch (error) {
        console.error('AI analysis failed:', error);
        error.details = `Analysis failed for content: ${JSON.stringify(content).substring(0, 100)}...`;
        throw error;
    }
} 