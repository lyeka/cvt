// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getContent') {
        try {
            // 获取页面主要内容
            const content = extractPageContent();
            sendResponse({ content });
        } catch (error) {
            console.error('提取内容失败:', error);
            sendResponse({ error: error.message });
        }
    }
    // 必须返回true以支持异步响应
    return true;
});

// 提取页面主要内容的函数
function extractPageContent() {
    // 创建一个新的文档片段来存储清理后的内容
    const content = {
        title: document.title,
        url: window.location.href,
        text: '',
        headings: [],
        paragraphs: []
    };

    // 获取所有标题元素
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
        if (isVisible(heading) && !isAdvertisement(heading)) {
            content.headings.push({
                level: parseInt(heading.tagName[1]),
                text: heading.textContent.trim()
            });
        }
    });

    // 获取所有段落
    const paragraphs = document.querySelectorAll('p');
    paragraphs.forEach(p => {
        if (isVisible(p) && !isAdvertisement(p) && p.textContent.trim().length > 20) {
            content.paragraphs.push(p.textContent.trim());
        }
    });

    // 获取文章主要内容
    const mainContent = findMainContent();
    if (mainContent) {
        content.text = mainContent.textContent.trim();
    } else {
        // 如果找不到主要内容，使用所有段落内容
        content.text = content.paragraphs.join('\n\n');
    }

    return content;
}

// 检查元素是否可见
function isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
}

// 检查元素是否是广告
function isAdvertisement(element) {
    const adKeywords = ['advertisement', 'ad', 'sponsor', 'promoted', '广告', '推广'];
    const classAndId = (element.className + ' ' + element.id).toLowerCase();
    return adKeywords.some(keyword => classAndId.includes(keyword));
}

// 查找页面的主要内容
function findMainContent() {
    // 常见的主要内容容器选择器
    const mainSelectors = [
        'article',
        'main',
        '.article',
        '.post',
        '.content',
        '#content',
        '.main-content',
        '[role="main"]'
    ];

    // 尝试找到主要内容容器
    for (const selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element && isVisible(element)) {
            return element;
        }
    }

    // 如果找不到主要内容容器，使用启发式方法
    return findContentByHeuristics();
}

// 使用启发式方法查找主要内容
function findContentByHeuristics() {
    // 获取所有段落
    const paragraphs = Array.from(document.getElementsByTagName('p'));
    
    // 如果段落太少，返回null
    if (paragraphs.length < 3) {
        return null;
    }

    // 找到包含最多段落的容器
    let bestContainer = null;
    let maxParagraphs = 0;

    paragraphs.forEach(p => {
        if (!isVisible(p) || isAdvertisement(p)) {
            return;
        }

        // 向上查找5层父元素
        let current = p;
        for (let i = 0; i < 5; i++) {
            if (!current.parentElement) {
                break;
            }
            current = current.parentElement;

            // 计算当前容器包含的段落数
            const containerParagraphs = current.getElementsByTagName('p');
            if (containerParagraphs.length > maxParagraphs) {
                maxParagraphs = containerParagraphs.length;
                bestContainer = current;
            }
        }
    });

    return bestContainer;
} 