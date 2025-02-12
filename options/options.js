// 导入配置
import { defaultConfig, availableModels, saveConfig, getConfig } from '../scripts/config.js';

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', async () => {
    // 获取所有输入元素
    const apiKeyInput = document.getElementById('api-key');
    const modelSelect = document.getElementById('model');
    const maxTokensInput = document.getElementById('max-tokens');
    const temperatureInput = document.getElementById('temperature');
    const topPInput = document.getElementById('top-p');
    const topKInput = document.getElementById('top-k');
    const frequencyPenaltyInput = document.getElementById('frequency-penalty');
    const presencePenaltyInput = document.getElementById('presence-penalty');
    const customPromptInput = document.getElementById('custom-prompt');
    const resetPromptBtn = document.getElementById('reset-prompt');
    const saveButton = document.getElementById('save-btn');
    const statusDiv = document.getElementById('status');

    // 填充模型选项
    availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    });

    // 加载保存的配置
    const savedConfig = await getConfig();
    
    // 设置表单值
    apiKeyInput.value = savedConfig.SILICONFLOW_API_KEY || '';
    modelSelect.value = savedConfig.MODEL || defaultConfig.MODEL;
    maxTokensInput.value = savedConfig.MAX_TOKENS || defaultConfig.MAX_TOKENS;
    temperatureInput.value = savedConfig.TEMPERATURE || defaultConfig.TEMPERATURE;
    topPInput.value = savedConfig.TOP_P || defaultConfig.TOP_P;
    topKInput.value = savedConfig.TOP_K || defaultConfig.TOP_K;
    frequencyPenaltyInput.value = savedConfig.FREQUENCY_PENALTY || defaultConfig.FREQUENCY_PENALTY;
    presencePenaltyInput.value = savedConfig.PRESENCE_PENALTY || defaultConfig.PRESENCE_PENALTY;
    customPromptInput.value = savedConfig.CUSTOM_PROMPT || '';

    // 重置提示词按钮点击事件
    resetPromptBtn.addEventListener('click', () => {
        customPromptInput.value = defaultConfig.DEFAULT_PROMPT;
        showStatus('已恢复默认提示词', 'success');
    });

    // 保存配置
    saveButton.addEventListener('click', async () => {
        const newConfig = {
            SILICONFLOW_API_KEY: apiKeyInput.value.trim(),
            MODEL: modelSelect.value,
            MAX_TOKENS: parseInt(maxTokensInput.value),
            TEMPERATURE: parseFloat(temperatureInput.value),
            TOP_P: parseFloat(topPInput.value),
            TOP_K: parseInt(topKInput.value),
            FREQUENCY_PENALTY: parseFloat(frequencyPenaltyInput.value),
            PRESENCE_PENALTY: parseFloat(presencePenaltyInput.value),
            CUSTOM_PROMPT: customPromptInput.value.trim()
        };

        try {
            // 验证输入
            if (!newConfig.SILICONFLOW_API_KEY) {
                throw new Error('请输入API密钥');
            }

            if (!availableModels.includes(newConfig.MODEL)) {
                throw new Error('请选择有效的模型');
            }

            // 验证数值范围
            if (newConfig.MAX_TOKENS < 1 || newConfig.MAX_TOKENS > 4096) {
                throw new Error('最大生成长度必须在1-4096之间');
            }

            if (newConfig.TEMPERATURE < 0 || newConfig.TEMPERATURE > 2) {
                throw new Error('随机性必须在0-2之间');
            }

            if (newConfig.TOP_P < 0 || newConfig.TOP_P > 1) {
                throw new Error('Top P必须在0-1之间');
            }

            if (newConfig.TOP_K < 1 || newConfig.TOP_K > 100) {
                throw new Error('Top K必须在1-100之间');
            }

            if (newConfig.FREQUENCY_PENALTY < -2 || newConfig.FREQUENCY_PENALTY > 2) {
                throw new Error('频率惩罚必须在-2到2之间');
            }

            if (newConfig.PRESENCE_PENALTY < -2 || newConfig.PRESENCE_PENALTY > 2) {
                throw new Error('存在惩罚必须在-2到2之间');
            }

            await saveConfig(newConfig);
            showStatus('设置已保存', 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        }
    });

    // 显示状态信息
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';

        // 3秒后隐藏状态信息
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}); 