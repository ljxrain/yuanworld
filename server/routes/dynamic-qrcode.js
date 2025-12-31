/**
 * 活码系统 API
 * 功能：动态二维码管理，支持后台切换跳转域名，防止微信封禁
 */

const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * 生成活码短标识
 */
function generateQRCodeId() {
    return 'Q' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * 获取当前可用的最优域名
 */
async function getBestAvailableDomain() {
    const [domains] = await sequelize.query(`
        SELECT id, domain, domain_type, priority
        FROM domain_pool
        WHERE status = 'active'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
    `);

    if (domains.length === 0) {
        throw new Error('没有可用的域名');
    }

    return domains[0];
}

/**
 * 创建活码
 * POST /api/qrcode/create
 * Body: { invitationCode, targetUrl }
 */
router.post('/create', authenticateToken, async (req, res) => {
    const { invitationCode, targetUrl } = req.body;
    const userId = req.user.id;

    try {
        // 生成活码标识
        const qrcodeId = generateQRCodeId();
        const shortPath = `/q/${qrcodeId}`;

        // 获取当前最优域名
        const bestDomain = await getBestAvailableDomain();

        // 目标URL（如果未提供，使用默认）
        const finalTargetUrl = targetUrl || `http://49.232.220.223/yuan/?code=${invitationCode}`;

        // 插入活码记录
        await sequelize.query(`
            INSERT INTO dynamic_qrcodes
            (code, user_id, invitation_code, target_url, current_domain_id, short_path, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        `, {
            bind: [qrcodeId, userId, invitationCode, finalTargetUrl, bestDomain.id, shortPath]
        });

        // 构建短链接（用于二维码）
        const shortUrl = `http://${bestDomain.domain}${shortPath}`;

        res.json({
            success: true,
            qrcodeId,
            shortUrl,
            shortPath,
            targetUrl: finalTargetUrl,
            currentDomain: bestDomain.domain
        });

    } catch (error) {
        console.error('创建活码失败:', error);
        res.status(500).json({
            success: false,
            message: '创建活码失败',
            error: error.message
        });
    }
});

/**
 * 获取我的活码列表
 * GET /api/qrcode/my-codes
 */
router.get('/my-codes', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const [codes] = await sequelize.query(`
            SELECT
                dq.id,
                dq.code,
                dq.invitation_code,
                dq.target_url,
                dq.short_path,
                dq.is_active,
                dq.total_scans,
                dq.unique_scans,
                dq.created_at,
                dq.last_scan_at,
                dp.domain as current_domain,
                dp.status as domain_status
            FROM dynamic_qrcodes dq
            LEFT JOIN domain_pool dp ON dq.current_domain_id = dp.id
            WHERE dq.user_id = $1
            ORDER BY dq.created_at DESC
        `, {
            bind: [userId]
        });

        res.json({
            success: true,
            codes
        });

    } catch (error) {
        console.error('获取活码列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取活码列表失败',
            error: error.message
        });
    }
});

/**
 * 切换活码的域名
 * POST /api/qrcode/switch-domain
 * Body: { qrcodeId, newDomainId }
 */
router.post('/switch-domain', authenticateToken, async (req, res) => {
    const { qrcodeId, newDomainId } = req.body;
    const userId = req.user.id;

    try {
        // 验证活码是否属于当前用户
        const [codes] = await sequelize.query(`
            SELECT id FROM dynamic_qrcodes
            WHERE code = $1 AND user_id = $2
        `, {
            bind: [qrcodeId, userId]
        });

        if (codes.length === 0) {
            return res.status(404).json({
                success: false,
                message: '活码不存在或无权限'
            });
        }

        // 验证新域名是否可用
        const [domains] = await sequelize.query(`
            SELECT id, domain FROM domain_pool
            WHERE id = $1 AND status = 'active'
        `, {
            bind: [newDomainId]
        });

        if (domains.length === 0) {
            return res.status(400).json({
                success: false,
                message: '目标域名不可用'
            });
        }

        // 更新活码的域名
        await sequelize.query(`
            UPDATE dynamic_qrcodes
            SET current_domain_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE code = $2
        `, {
            bind: [newDomainId, qrcodeId]
        });

        res.json({
            success: true,
            message: '域名切换成功',
            newDomain: domains[0].domain
        });

    } catch (error) {
        console.error('切换域名失败:', error);
        res.status(500).json({
            success: false,
            message: '切换域名失败',
            error: error.message
        });
    }
});

/**
 * 短链接跳转处理
 * GET /q/:code
 */
router.get('/q/:code', async (req, res) => {
    const { code } = req.params;
    const userAgent = req.headers['user-agent'] || '';
    const isWechat = /MicroMessenger/i.test(userAgent);
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    try {
        // 查询活码信息
        const [codes] = await sequelize.query(`
            SELECT
                dq.id,
                dq.target_url,
                dq.is_active,
                dp.domain as current_domain,
                dp.status as domain_status
            FROM dynamic_qrcodes dq
            LEFT JOIN domain_pool dp ON dq.current_domain_id = dp.id
            WHERE dq.code = $1
        `, {
            bind: [code]
        });

        if (codes.length === 0) {
            return res.status(404).send('活码不存在');
        }

        const qrcodeData = codes[0];

        // 检查活码是否激活
        if (!qrcodeData.is_active) {
            return res.status(403).send('活码已停用');
        }

        // 记录扫描日志
        await sequelize.query(`
            INSERT INTO qrcode_scan_logs
            (qrcode_id, user_agent, ip_address, is_wechat, scan_time, redirect_success)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, TRUE)
        `, {
            bind: [qrcodeData.id, userAgent, clientIp, isWechat]
        });

        // 更新扫描次数
        await sequelize.query(`
            UPDATE dynamic_qrcodes
            SET total_scans = total_scans + 1,
                last_scan_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, {
            bind: [qrcodeData.id]
        });

        // 如果是微信内打开，显示引导页
        if (isWechat) {
            return res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>请在浏览器中打开</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px 30px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            max-width: 400px;
        }
        .icon {
            font-size: 60px;
            margin-bottom: 20px;
        }
        h1 {
            font-size: 24px;
            color: #333;
            margin-bottom: 15px;
        }
        p {
            color: #666;
            line-height: 1.8;
            margin-bottom: 10px;
        }
        .steps {
            background: #f5f5f5;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }
        .step {
            margin: 10px 0;
            color: #333;
        }
        .highlight {
            color: #667eea;
            font-weight: bold;
        }
        .url {
            background: #fff3cd;
            padding: 10px;
            border-radius: 5px;
            word-break: break-all;
            margin: 15px 0;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🌐</div>
        <h1>请在浏览器中打开</h1>
        <p>检测到您在微信中访问</p>

        <div class="steps">
            <div class="step">1️⃣ 点击右上角 <span class="highlight">【···】</span></div>
            <div class="step">2️⃣ 选择 <span class="highlight">【在浏览器打开】</span></div>
            <div class="step">3️⃣ 即可正常访问</div>
        </div>

        <p style="font-size: 14px; color: #999; margin-top: 20px;">
            或手动复制下方网址到浏览器：
        </p>
        <div class="url">${qrcodeData.target_url}</div>
    </div>
</body>
</html>
            `);
        }

        // 非微信浏览器，直接跳转
        res.redirect(302, qrcodeData.target_url);

    } catch (error) {
        console.error('短链接跳转失败:', error);

        // 记录错误日志
        try {
            await sequelize.query(`
                INSERT INTO qrcode_scan_logs
                (user_agent, ip_address, is_wechat, scan_time, redirect_success, error_message)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP, FALSE, $4)
            `, {
                bind: [userAgent, clientIp, isWechat, error.message]
            });
        } catch (logError) {
            console.error('记录日志失败:', logError);
        }

        res.status(500).send('跳转失败，请稍后重试');
    }
});

/**
 * 添加域名到域名池
 * POST /api/qrcode/add-domain
 * Body: { domain, domainType, priority }
 */
router.post('/add-domain', authenticateToken, async (req, res) => {
    const { domain, domainType = 'cannon', priority = 50 } = req.body;

    // 这里应该添加管理员权限验证
    // 暂时允许所有登录用户添加

    try {
        await sequelize.query(`
            INSERT INTO domain_pool (domain, domain_type, status, priority)
            VALUES ($1, $2, 'active', $3)
            ON CONFLICT (domain) DO UPDATE
            SET domain_type = $2, priority = $3, status = 'active'
        `, {
            bind: [domain, domainType, priority]
        });

        res.json({
            success: true,
            message: '域名添加成功'
        });

    } catch (error) {
        console.error('添加域名失败:', error);
        res.status(500).json({
            success: false,
            message: '添加域名失败',
            error: error.message
        });
    }
});

/**
 * 标记域名为已封禁
 * POST /api/qrcode/mark-blocked
 * Body: { domainId }
 */
router.post('/mark-blocked', authenticateToken, async (req, res) => {
    const { domainId } = req.body;

    try {
        // 更新域名状态
        await sequelize.query(`
            UPDATE domain_pool
            SET status = 'blocked',
                blocked_at = CURRENT_TIMESTAMP,
                block_count = block_count + 1
            WHERE id = $1
        `, {
            bind: [domainId]
        });

        // 记录健康检测日志
        await sequelize.query(`
            INSERT INTO domain_health_checks
            (domain_id, is_accessible, is_blocked_by_wechat, check_method)
            VALUES ($1, FALSE, TRUE, 'manual')
        `, {
            bind: [domainId]
        });

        // 获取受影响的活码数量
        const [affected] = await sequelize.query(`
            SELECT COUNT(*) as count
            FROM dynamic_qrcodes
            WHERE current_domain_id = $1 AND is_active = TRUE
        `, {
            bind: [domainId]
        });

        res.json({
            success: true,
            message: '域名已标记为封禁',
            affectedQRCodes: affected[0].count
        });

    } catch (error) {
        console.error('标记域名失败:', error);
        res.status(500).json({
            success: false,
            message: '标记域名失败',
            error: error.message
        });
    }
});

/**
 * 获取域名池列表
 * GET /api/qrcode/domains
 */
router.get('/domains', authenticateToken, async (req, res) => {
    try {
        const [domains] = await sequelize.query(`
            SELECT
                id,
                domain,
                domain_type,
                status,
                priority,
                total_visits,
                block_count,
                blocked_at,
                created_at,
                last_checked_at
            FROM domain_pool
            ORDER BY priority DESC, created_at ASC
        `);

        res.json({
            success: true,
            domains
        });

    } catch (error) {
        console.error('获取域名列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取域名列表失败',
            error: error.message
        });
    }
});

/**
 * 批量切换被封域名的活码到新域名
 * POST /api/qrcode/batch-switch
 * Body: { oldDomainId, newDomainId }
 */
router.post('/batch-switch', authenticateToken, async (req, res) => {
    const { oldDomainId, newDomainId } = req.body;

    try {
        // 验证新域名可用
        const [newDomain] = await sequelize.query(`
            SELECT id, domain FROM domain_pool
            WHERE id = $1 AND status = 'active'
        `, {
            bind: [newDomainId]
        });

        if (newDomain.length === 0) {
            return res.status(400).json({
                success: false,
                message: '目标域名不可用'
            });
        }

        // 批量更新
        const [result] = await sequelize.query(`
            UPDATE dynamic_qrcodes
            SET current_domain_id = $1, updated_at = CURRENT_TIMESTAMP
            WHERE current_domain_id = $2 AND is_active = TRUE
        `, {
            bind: [newDomainId, oldDomainId]
        });

        res.json({
            success: true,
            message: `批量切换成功`,
            newDomain: newDomain[0].domain
        });

    } catch (error) {
        console.error('批量切换域名失败:', error);
        res.status(500).json({
            success: false,
            message: '批量切换域名失败',
            error: error.message
        });
    }
});

module.exports = router;
