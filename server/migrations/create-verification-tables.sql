/**
 * 验证码系统数据库迁移脚本
 * 创建验证码表并修改用户表
 */

-- 1. 创建验证码记录表
CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 验证码信息
    code VARCHAR(6) NOT NULL,                    -- 6位数字验证码
    type VARCHAR(20) NOT NULL,                   -- 'sms' 或 'email'
    target VARCHAR(100) NOT NULL,                -- 手机号或邮箱

    -- 用途
    purpose VARCHAR(50) NOT NULL,                -- 'register', 'login', 'reset_password'

    -- 状态
    is_used BOOLEAN DEFAULT FALSE,               -- 是否已使用
    used_at TIMESTAMP,                           -- 使用时间

    -- 有效期
    expires_at TIMESTAMP NOT NULL,               -- 过期时间（5分钟后）

    -- IP和设备信息
    ip_address VARCHAR(45),                      -- 请求IP
    user_agent TEXT,                             -- 浏览器信息

    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_verification_target_type ON verification_codes(target, type);
CREATE INDEX IF NOT EXISTS idx_verification_code_target ON verification_codes(code, target);
CREATE INDEX IF NOT EXISTS idx_verification_expires ON verification_codes(expires_at);

-- 2. 修改用户表，添加手机号和验证状态字段
ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(20) UNIQUE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS registration_type VARCHAR(20) DEFAULT 'username';

-- 创建手机号索引
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- 3. 注释
COMMENT ON TABLE verification_codes IS '验证码记录表';
COMMENT ON COLUMN verification_codes.code IS '6位数字验证码';
COMMENT ON COLUMN verification_codes.type IS '验证码类型：sms=短信，email=邮件';
COMMENT ON COLUMN verification_codes.target IS '发送目标：手机号或邮箱';
COMMENT ON COLUMN verification_codes.purpose IS '用途：register=注册，login=登录，reset_password=重置密码';
COMMENT ON COLUMN verification_codes.is_used IS '是否已使用';
COMMENT ON COLUMN verification_codes.expires_at IS '过期时间';

COMMENT ON COLUMN users.phone IS '用户手机号';
COMMENT ON COLUMN users.phone_verified IS '手机号是否已验证';
COMMENT ON COLUMN users.email_verified IS '邮箱是否已验证';
COMMENT ON COLUMN users.registration_type IS '注册方式：phone=手机号，email=邮箱，username=用户名';
