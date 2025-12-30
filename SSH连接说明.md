# Yuan World 腾讯云服务器 SSH 连接说明

## 服务器信息
- **公网IP**: 49.232.220.223
- **内网IP**: 10.2.20.6/22
- **用户名**: ubuntu
- **操作系统**: Ubuntu 24.04.3 LTS
- **地区**: 北京 - 北京六区

## SSH 连接方式

### 方式一：使用 SSH 别名（推荐）

SSH 配置已经在 `~/.ssh/config` 中设置好，可以直接使用别名连接：

```bash
# 使用完整别名
ssh yuan-world-tencent

# 或使用简化别名
ssh yuan
```

### 方式二：使用完整命令

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@49.232.220.223
```

## SSH 配置详情

在 `~/.ssh/config` 文件中的配置如下：

```
Host yuan-world-tencent
    HostName 49.232.220.223
    User ubuntu
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    ServerAliveInterval 60
    ServerAliveCountMax 3
    ForwardAgent yes

Host yuan
    HostName 49.232.220.223
    User ubuntu
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    StrictHostKeyChecking no
    ServerAliveInterval 60
```

## 常用管理命令

### 查看应用状态
```bash
ssh yuan 'pm2 status'
```

### 查看应用日志
```bash
ssh yuan 'pm2 logs yuan-world-app --lines 50'
```

### 重启应用
```bash
ssh yuan 'pm2 restart yuan-world-app'
```

### 查看系统资源
```bash
ssh yuan 'free -h && df -h'
```

### 查看 Nginx 状态
```bash
ssh yuan 'systemctl status nginx'
```

## 服务器配置信息

- **CPU**: AMD EPYC 7K62 (2核心)
- **内存**: 3.6GB
- **磁盘**: 59GB (已用15GB, 可用42GB)
- **运行时长**: 稳定运行165+天

## 运行的服务

- **Yuan World App**: PM2管理，端口8080
- **Nginx**: 反向代理，端口80
- **PostgreSQL**: 数据库服务，端口5432（仅本地）

## 网站访问地址

- **公网访问**: http://49.232.220.223
- **应用端口**: http://49.232.220.223:8080

## 注意事项

1. **SSH密钥位置**: `~/.ssh/id_ed25519`（已配置好，无需额外操作）
2. **用户名**: 必须使用 `ubuntu`，不是 `root`
3. **端口**: SSH默认端口22，已开放
4. **安全组**: 已配置端口 22, 80, 8080

## 快速测试连接

```bash
# 测试连接并查看服务器信息
ssh yuan 'hostname && uptime && pm2 list'
```

---

**创建时间**: 2025-12-30
**最后更新**: 2025-12-30
