/**
 * 验证码服务
 * 处理验证码的生成、验证、频率限制等
 */

const { sequelize } = require('../config/database');
const { sendVerificationCode: sendEmail } = require('./email');

/**
 * 生成6位随机数字验证码
 */
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 检查发送频率限制
 */
async function checkRateLimit(target, type) {
    const now = new Date();

    // 检查60秒内是否已发送
    const [recentCodes] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM verification_codes
        WHERE target = :target
        AND type = :type
        AND created_at > :oneMinuteAgo
    `, {
        replacements: {
            target,
            type,
            oneMinuteAgo: new Date(now.getTime() - 60 * 1000)
        }
    });

    if (recentCodes[0].count > 0) {
        return {
            allowed: false,
            message: '发送过于频繁，请60秒后再试'
        };
    }

    // 检查1小时内发送次数
    const [hourlyCodes] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM verification_codes
        WHERE target = :target
        AND type = :type
        AND created_at > :oneHourAgo
    `, {
        replacements: {
            target,
            type,
            oneHourAgo: new Date(now.getTime() - 60 * 60 * 1000)
        }
    });

    if (hourlyCodes[0].count >= 5) {
        return {
            allowed: false,
            message: '1小时内最多发送5次验证码，请稍后再试'
        };
    }

    // 检查24小时内发送次数
    const [dailyCodes] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM verification_codes
        WHERE target = :target
        AND type = :type
        AND created_at > :oneDayAgo
    `, {
        replacements: {
            target,
            type,
            oneDayAgo: new Date(now.getTime() - 24 * 60 * 60 * 1000)
        }
    });

    if (dailyCodes[0].count >= 10) {
        return {
            allowed: false,
            message: '24小时内最多发送10次验证码，请明天再试'
        };
    }

    return { allowed: true };
}

/**
 * 发送验证码
 */
async function sendVerificationCode(options) {
    const { type, target, purpose, ipAddress, userAgent } = options;

    // 验证参数
    if (!type || !target || !purpose) {
        throw new Error('缺少必要参数');
    }

    if (type !== 'sms' && type !== 'email') {
        throw new Error('验证码类型错误');
    }

    // 验证目标格式
    if (type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(target)) {
            throw new Error('邮箱格式不正确');
        }
    } else if (type === 'sms') {
        const phoneRegex = /^1[3-9]\d{9}$/;
        if (!phoneRegex.test(target)) {
            throw new Error('手机号格式不正确');
        }
    }

    // 检查频率限制
    const rateLimit = await checkRateLimit(target, type);
    if (!rateLimit.allowed) {
        throw new Error(rateLimit.message);
    }

    // 生成验证码
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期

    // 保存到数据库
    await sequelize.query(`
        INSERT INTO verification_codes (code, type, target, purpose, expires_at, ip_address, user_agent)
        VALUES (:code, :type, :target, :purpose, :expiresAt, :ipAddress, :userAgent)
    `, {
        replacements: {
            code,
            type,
            target,
            purpose,
            expiresAt,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null
        }
    });

    // 发送验证码
    try {
        if (type === 'email') {
            await sendEmail(target, code, purpose);
            console.log(`✅ 邮件验证码已发送: ${target}, code: ${code}`);
        } else if (type === 'sms') {
            // TODO: 实现短信发送
            console.log(`⏳ 短信验证码待发送: ${target}, code: ${code}`);
            // await sendSMS(target, code, purpose);
        }
    } catch (error) {
        console.error('发送验证码失败:', error);
        throw new Error('验证码发送失败');
    }

    return {
        success: true,
        message: '验证码已发送',
        expiresIn: 300 // 5分钟
    };
}

/**
 * 验证验证码
 */
async function verifyCode(target, code, purpose) {
    const now = new Date();

    // 查询验证码
    const [codes] = await sequelize.query(`
        SELECT *
        FROM verification_codes
        WHERE target = :target
        AND code = :code
        AND purpose = :purpose
        AND is_used = FALSE
        AND expires_at > :now
        ORDER BY created_at DESC
        LIMIT 1
    `, {
        replacements: {
            target,
            code,
            purpose,
            now
        }
    });

    if (codes.length === 0) {
        return {
            valid: false,
            message: '验证码错误或已过期'
        };
    }

    // 标记为已使用
    await sequelize.query(`
        UPDATE verification_codes
        SET is_used = TRUE, used_at = :now
        WHERE id = :id
    `, {
        replacements: {
            id: codes[0].id,
            now
        }
    });

    return {
        valid: true,
        message: '验证成功'
    };
}

/**
 * 清理过期验证码（定时任务）
 */
async function cleanExpiredCodes() {
    try {
        const result = await sequelize.query(`
            DELETE FROM verification_codes
            WHERE expires_at < NOW() - INTERVAL '1 day'
        `);

        const deletedCount = result[1] || 0;
        if (deletedCount > 0) {
            console.log(`🗑️ 已清理 ${deletedCount} 条过期验证码`);
        }
    } catch (error) {
        console.error('清理过期验证码失败:', error);
    }
}

module.exports = {
    sendVerificationCode,
    verifyCode,
    cleanExpiredCodes
};
