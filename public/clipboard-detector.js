/**
 * 剪贴板口令检测器
 * 模仿淘宝/抖音的口令识别机制
 */

class ClipboardDetector {
    constructor() {
        this.codePattern = /#博世界AI([A-Z0-9]{8})#/;  // 匹配 #博世界AI8888#
        this.detected = false;
    }

    /**
     * 初始化检测器
     */
    async init() {
        // 页面加载时检测
        window.addEventListener('DOMContentLoaded', () => {
            this.detectClipboard();
        });

        // 页面获得焦点时检测
        window.addEventListener('focus', () => {
            if (!this.detected) {
                this.detectClipboard();
            }
        });
    }

    /**
     * 检测剪贴板内容
     */
    async detectClipboard() {
        try {
            // 请求剪贴板权限
            const permission = await navigator.permissions.query({
                name: 'clipboard-read'
            });

            if (permission.state === 'denied') {
                console.log('剪贴板权限被拒绝');
                return;
            }

            // 读取剪贴板
            const text = await navigator.clipboard.readText();

            // 检查是否包含邀请码
            const match = text.match(this.codePattern);

            if (match && match[1]) {
                const inviteCode = match[1];
                this.detected = true;
                this.showInviteModal(inviteCode, text);
            }

        } catch (error) {
            // Safari等浏览器可能不支持自动读取
            console.log('无法读取剪贴板:', error.message);

            // 降级方案：显示手动输入框
            this.showManualInput();
        }
    }

    /**
     * 显示邀请码弹窗
     */
    showInviteModal(code, fullText) {
        // 检查是否已经使用过邀请码
        const usedCode = localStorage.getItem('used_invite_code');
        if (usedCode === code) {
            console.log('该邀请码已使用过');
            return;
        }

        // 创建模态框
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s;
        `;

        modal.innerHTML = `
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
            <div style="
                background: white;
                border-radius: 20px;
                padding: 30px;
                max-width: 400px;
                width: 100%;
                animation: slideUp 0.3s;
            ">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 48px; margin-bottom: 10px;">🎁</div>
                    <h2 style="color: #333; margin: 0 0 10px 0;">检测到邀请码</h2>
                    <p style="color: #999; font-size: 14px;">您的好友邀请您加入博世界</p>
                </div>

                <div style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    padding: 20px;
                    border-radius: 15px;
                    text-align: center;
                    margin-bottom: 20px;
                ">
                    <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">邀请码</div>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 3px; font-family: 'Courier New', monospace;">${code}</div>
                </div>

                <div style="
                    background: #f5f5f5;
                    padding: 15px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                ">
                    <p style="color: #666; font-size: 13px; line-height: 1.6; margin: 0;">
                        ✅ 使用此邀请码注册，您和邀请人都将获得推荐奖励<br>
                        ✅ 直推30%，二级10%，三级5%佣金
                    </p>
                </div>

                <div style="display: grid; gap: 10px;">
                    <button onclick="window.clipboardDetector.useInviteCode('${code}')" style="
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        color: white;
                        border: none;
                        padding: 15px;
                        border-radius: 10px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                    ">
                        ✅ 立即使用
                    </button>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="
                        background: #f5f5f5;
                        color: #666;
                        border: none;
                        padding: 15px;
                        border-radius: 10px;
                        font-size: 16px;
                        cursor: pointer;
                    ">
                        取消
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * 使用邀请码
     */
    useInviteCode(code) {
        // 保存邀请码到localStorage
        localStorage.setItem('pending_invite_code', code);
        localStorage.setItem('used_invite_code', code);

        // 关闭模态框
        const modal = document.querySelector('[style*="position: fixed"]');
        if (modal) modal.remove();

        // 检查用户是否已登录
        const token = localStorage.getItem('token');

        if (token) {
            // 已登录：调用绑定API
            this.bindInviter(code);
        } else {
            // 未登录：跳转到注册页面
            window.location.href = `/yuan/register.html?code=${code}`;
        }
    }

    /**
     * 绑定邀请人
     */
    async bindInviter(code) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/yuan/api/distribution/bind-inviter', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inviter_code: code
                })
            });

            const result = await response.json();

            if (result.success) {
                alert('✅ 邀请码绑定成功！\n您和邀请人都将获得推荐奖励');

                // 清除pending状态
                localStorage.removeItem('pending_invite_code');

                // 刷新页面
                window.location.reload();
            } else {
                alert(result.message || '绑定失败');
            }

        } catch (error) {
            console.error('绑定邀请码失败:', error);
            alert('绑定失败，请稍后重试');
        }
    }

    /**
     * 显示手动输入框（降级方案）
     */
    showManualInput() {
        // 如果URL已经有code参数，就不显示了
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('code')) {
            return;
        }

        // 检查是否已经绑定过
        const token = localStorage.getItem('token');
        if (!token) {
            return; // 未登录不显示
        }

        // TODO: 显示手动输入邀请码的入口
        console.log('可以添加手动输入邀请码的入口');
    }
}

// 创建全局实例
window.clipboardDetector = new ClipboardDetector();

// 自动初始化
window.clipboardDetector.init();
