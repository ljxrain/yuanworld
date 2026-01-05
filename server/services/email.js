/**
 * 邮件发送服务
 * 使用 nodemailer 发送邮件验证码
 */

const nodemailer = require('nodemailer');

// 邮件配置（使用环境变量）
const EMAIL_CONFIG = {
    service: process.env.EMAIL_SERVICE || 'qq', // 'qq', '163', 'gmail'
    host: process.env.EMAIL_HOST || 'smtp.qq.com',
    port: process.env.EMAIL_PORT || 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER || 'your-email@qq.com',
        pass: process.env.EMAIL_PASSWORD || 'your-auth-code'
    }
};

// 创建邮件传输器
let transporter = null;

function createTransporter() {
    try {
        transporter = nodemailer.createTransport(EMAIL_CONFIG);
        console.log('✅ 邮件服务初始化成功');
        return transporter;
    } catch (error) {
        console.error('❌ 邮件服务初始化失败:', error);
        return null;
    }
}

/**
 * 发送验证码邮件
 */
async function sendVerificationCode(email, code, purpose = 'register') {
    try {
        if (!transporter) {
            transporter = createTransporter();
        }

        if (!transporter) {
            throw new Error('邮件服务未初始化');
        }

        // 根据用途选择邮件模板
        const templates = {
            register: {
                subject: '【博世界】注册验证码',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h1 style="color: #90EE90; text-align: center; margin-bottom: 30px;">博世界 AI生图</h1>

                            <h2 style="color: #333; margin-bottom: 20px;">注册验证码</h2>

                            <p style="color: #666; font-size: 16px; line-height: 1.6;">
                                您好！感谢您注册博世界AI图像生成服务。
                            </p>

                            <div style="background-color: #f9f9f9; border-left: 4px solid #90EE90; padding: 20px; margin: 20px 0;">
                                <p style="margin: 0; color: #666;">您的验证码是：</p>
                                <p style="font-size: 32px; font-weight: bold; color: #90EE90; margin: 10px 0; letter-spacing: 5px;">
                                    ${code}
                                </p>
                                <p style="margin: 0; color: #999; font-size: 14px;">有效期：5分钟</p>
                            </div>

                            <p style="color: #666; font-size: 14px; line-height: 1.6;">
                                如果这不是您本人的操作，请忽略此邮件。
                            </p>

                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

                            <p style="color: #999; font-size: 12px; text-align: center;">
                                此邮件由系统自动发送，请勿回复。<br>
                                © 2026 博世界 - AI图像生成服务
                            </p>
                        </div>
                    </div>
                `
            },
            login: {
                subject: '【博世界】登录验证码',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; padding: 30px;">
                            <h1 style="color: #90EE90;">博世界</h1>
                            <h2>登录验证码</h2>
                            <p>您的验证码是：<strong style="font-size: 24px; color: #90EE90;">${code}</strong></p>
                            <p>有效期：5分钟</p>
                        </div>
                    </div>
                `
            },
            reset_password: {
                subject: '【博世界】重置密码验证码',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; padding: 30px;">
                            <h1 style="color: #90EE90;">博世界</h1>
                            <h2>重置密码验证码</h2>
                            <p>您的验证码是：<strong style="font-size: 24px; color: #90EE90;">${code}</strong></p>
                            <p>有效期：5分钟</p>
                            <p style="color: #ff6b6b;">⚠️ 如果这不是您本人的操作，请立即修改密码！</p>
                        </div>
                    </div>
                `
            }
        };

        const template = templates[purpose] || templates.register;

        const mailOptions = {
            from: `"博世界AI" <${EMAIL_CONFIG.auth.user}>`,
            to: email,
            subject: template.subject,
            html: template.html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ 验证码邮件发送成功: ${email}, MessageID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error('❌ 发送验证码邮件失败:', error);
        throw new Error('邮件发送失败：' + error.message);
    }
}

/**
 * 测试邮件连接
 */
async function testEmailConnection() {
    try {
        if (!transporter) {
            transporter = createTransporter();
        }
        await transporter.verify();
        console.log('✅ 邮件服务连接测试成功');
        return true;
    } catch (error) {
        console.error('❌ 邮件服务连接测试失败:', error);
        return false;
    }
}

module.exports = {
    sendVerificationCode,
    testEmailConnection
};
