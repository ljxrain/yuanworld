-- 活码系统数据库表
-- 用途：支持二维码内容动态切换，防止微信封禁

-- 1. 域名池表（管理多个备用域名）
CREATE TABLE IF NOT EXISTS domain_pool (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(100) UNIQUE NOT NULL,           -- 域名（如 a.com, b.top, c.xyz）
    domain_type VARCHAR(20) DEFAULT 'cannon',      -- 类型：cannon(炮灰), main(主站), high_trust(高权重)
    status VARCHAR(20) DEFAULT 'active',           -- 状态：active(可用), blocked(已封), testing(测试中)
    priority INTEGER DEFAULT 50,                   -- 优先级（1-100，越高越优先）
    blocked_at TIMESTAMP,                          -- 被封时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_checked_at TIMESTAMP,                     -- 最后检测时间
    total_visits INTEGER DEFAULT 0,                -- 总访问次数
    block_count INTEGER DEFAULT 0,                 -- 被封次数
    notes TEXT                                     -- 备注
);

-- 2. 活码表（动态二维码管理）
CREATE TABLE IF NOT EXISTS dynamic_qrcodes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,              -- 活码标识（如 Q8888）
    user_id UUID REFERENCES users(id),             -- 关联用户（可选）
    invitation_code VARCHAR(20),                   -- 关联邀请码
    target_url TEXT NOT NULL,                      -- 目标URL（最终要跳转的地址）
    current_domain_id INTEGER REFERENCES domain_pool(id), -- 当前使用的域名
    short_path VARCHAR(50) UNIQUE NOT NULL,        -- 短路径（如 /q/8888）
    qr_image_url TEXT,                             -- 二维码图片URL
    is_active BOOLEAN DEFAULT TRUE,                -- 是否激活
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,                          -- 过期时间
    total_scans INTEGER DEFAULT 0,                 -- 总扫描次数
    unique_scans INTEGER DEFAULT 0,                -- 独立扫描次数
    last_scan_at TIMESTAMP,                        -- 最后扫描时间
    notes TEXT
);

-- 3. 活码访问日志（用于分析和监控）
CREATE TABLE IF NOT EXISTS qrcode_scan_logs (
    id SERIAL PRIMARY KEY,
    qrcode_id INTEGER REFERENCES dynamic_qrcodes(id),
    domain_id INTEGER REFERENCES domain_pool(id),
    user_agent TEXT,                               -- 浏览器UA
    ip_address VARCHAR(50),                        -- 访问IP
    is_wechat BOOLEAN DEFAULT FALSE,               -- 是否微信内打开
    referrer TEXT,                                 -- 来源
    scan_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    redirect_success BOOLEAN DEFAULT TRUE,         -- 是否跳转成功
    error_message TEXT                             -- 错误信息
);

-- 4. 域名健康检测日志
CREATE TABLE IF NOT EXISTS domain_health_checks (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER REFERENCES domain_pool(id),
    check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_accessible BOOLEAN DEFAULT TRUE,            -- 是否可访问
    is_blocked_by_wechat BOOLEAN DEFAULT FALSE,    -- 是否被微信封禁
    response_time INTEGER,                         -- 响应时间（毫秒）
    http_status INTEGER,                           -- HTTP状态码
    error_message TEXT,
    check_method VARCHAR(50) DEFAULT 'auto'        -- 检测方式：auto(自动), manual(人工)
);

-- 5. 高权重平台配置（腾讯文档、石墨等）
CREATE TABLE IF NOT EXISTS trusted_platform_configs (
    id SERIAL PRIMARY KEY,
    platform_name VARCHAR(50) UNIQUE NOT NULL,     -- 平台名称：tencent_docs, shimo, feishu
    platform_url_template TEXT NOT NULL,           -- URL模板（如 https://docs.qq.com/doc/{doc_id}）
    is_active BOOLEAN DEFAULT TRUE,
    api_key TEXT,                                  -- API密钥（如果需要）
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_domain_status ON domain_pool(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_qrcode_code ON dynamic_qrcodes(code);
CREATE INDEX IF NOT EXISTS idx_qrcode_user ON dynamic_qrcodes(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_qrcode ON qrcode_scan_logs(qrcode_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_time ON qrcode_scan_logs(scan_time DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_domain ON domain_health_checks(domain_id);

-- 插入初始数据：主站域名
INSERT INTO domain_pool (domain, domain_type, status, priority, notes)
VALUES
    ('49.232.220.223', 'main', 'active', 100, '主站IP地址'),
    ('docs.qq.com', 'high_trust', 'active', 90, '腾讯文档（高权重）'),
    ('shimo.im', 'high_trust', 'active', 85, '石墨文档（高权重）')
ON CONFLICT (domain) DO NOTHING;

-- 插入高权重平台配置
INSERT INTO trusted_platform_configs (platform_name, platform_url_template, notes)
VALUES
    ('tencent_docs', 'https://docs.qq.com/doc/{doc_id}', '腾讯文档'),
    ('shimo', 'https://shimo.im/docs/{doc_id}', '石墨文档'),
    ('feishu', 'https://feishu.cn/docs/{doc_id}', '飞书文档')
ON CONFLICT (platform_name) DO NOTHING;

COMMENT ON TABLE domain_pool IS '域名池管理表，存储所有可用域名';
COMMENT ON TABLE dynamic_qrcodes IS '活码管理表，二维码内容可动态切换';
COMMENT ON TABLE qrcode_scan_logs IS '活码扫描日志，用于分析和监控';
COMMENT ON TABLE domain_health_checks IS '域名健康检测日志';
COMMENT ON TABLE trusted_platform_configs IS '高权重平台配置';
