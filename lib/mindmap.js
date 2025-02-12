class MindMap {
    constructor(container, config) {
        this.container = container;
        this.data = config.data;
        this.options = {
            scale: 1,
            lineColor: '#007bff',
            nodeColor: '#e7f1ff',
            textColor: '#212529',
            ...config.options
        };

        this.svg = null;
        this.nodeWidth = 150;
        this.nodeHeight = 40;
        this.horizontalSpace = 60;
        this.verticalSpace = 40;

        this.init();
    }

    init() {
        // 清空容器
        this.container.innerHTML = '';

        // 创建SVG元素
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width', '100%');
        this.svg.setAttribute('height', '100%');
        this.container.appendChild(this.svg);

        // 创建根节点组
        this.rootGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.svg.appendChild(this.rootGroup);

        // 绘制思维导图
        this.draw();

        // 添加拖动功能
        this.setupDragging();
    }

    draw() {
        // 计算布局
        this.calculateLayout(this.data, 0, 0);

        // 绘制连线
        this.drawConnections(this.data);

        // 绘制节点
        this.drawNode(this.data);
    }

    calculateLayout(node, x, y) {
        node.x = x;
        node.y = y;

        if (node.children && node.children.length > 0) {
            const totalHeight = (node.children.length - 1) * this.verticalSpace;
            let currentY = y - totalHeight / 2;

            node.children.forEach(child => {
                this.calculateLayout(
                    child,
                    x + this.nodeWidth + this.horizontalSpace,
                    currentY
                );
                currentY += this.verticalSpace;
            });
        }
    }

    drawConnections(node) {
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                // 创建连线
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const startX = node.x + this.nodeWidth;
                const startY = node.y + this.nodeHeight / 2;
                const endX = child.x;
                const endY = child.y + this.nodeHeight / 2;
                const controlX = (startX + endX) / 2;

                const d = `M ${startX} ${startY} 
                          C ${controlX} ${startY}, 
                            ${controlX} ${endY}, 
                            ${endX} ${endY}`;

                line.setAttribute('d', d);
                line.setAttribute('stroke', this.options.lineColor);
                line.setAttribute('stroke-width', '2');
                line.setAttribute('fill', 'none');

                this.rootGroup.appendChild(line);

                // 递归绘制子节点的连线
                this.drawConnections(child);
            });
        }
    }

    drawNode(node) {
        // 创建节点组
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${node.x},${node.y})`);

        // 创建节点矩形
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', this.nodeWidth.toString());
        rect.setAttribute('height', this.nodeHeight.toString());
        rect.setAttribute('rx', '5');
        rect.setAttribute('ry', '5');
        rect.setAttribute('fill', this.options.nodeColor);
        rect.setAttribute('stroke', this.options.lineColor);
        rect.setAttribute('stroke-width', '1');

        // 创建文本
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (this.nodeWidth / 2).toString());
        text.setAttribute('y', (this.nodeHeight / 2).toString());
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', this.options.textColor);
        text.textContent = this.truncateText(node.text, 20);

        // 添加提示框
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = node.text;
        text.appendChild(title);

        group.appendChild(rect);
        group.appendChild(text);
        this.rootGroup.appendChild(group);

        // 递归绘制子节点
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => this.drawNode(child));
        }
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    setupDragging() {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let originalTransform = { x: 0, y: 0 };

        this.svg.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const transform = this.rootGroup.getAttribute('transform');
            if (transform) {
                const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
                if (match) {
                    originalTransform = {
                        x: parseFloat(match[1]),
                        y: parseFloat(match[2])
                    };
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.rootGroup.setAttribute(
                    'transform',
                    `translate(${originalTransform.x + dx},${originalTransform.y + dy})`
                );
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    setScale(scale) {
        this.options.scale = scale;
        this.rootGroup.setAttribute('transform', `scale(${scale})`);
    }

    center() {
        this.rootGroup.setAttribute('transform', 'translate(0,0) scale(1)');
    }

    resize() {
        // 重新计算SVG大小
        this.svg.setAttribute('width', '100%');
        this.svg.setAttribute('height', '100%');
    }

    destroy() {
        // 清空容器
        this.container.innerHTML = '';
        // 移除事件监听器
        this.svg.removeEventListener('mousedown', null);
        document.removeEventListener('mousemove', null);
        document.removeEventListener('mouseup', null);
    }
} 