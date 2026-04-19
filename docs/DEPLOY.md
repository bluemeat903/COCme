# 部署到实验室服务器

场景：**服务器没有公网入站 + 你没有 sudo + 出站可能要走代理**。因此我们用"**拉式部署**"：服务器定期或手动从 GitHub 拉、重新 build、重启。GitHub 本身不主动触发任何事。

---

## 一次性设置

在服务器上跑一次就行。下面假设你以普通用户身份登录、仓库已经 clone 到 `$HOME/.../COC`。

### 1. 让 git 能访问 github

如果服务器直连 github 就能通，跳过这一步。否则把代理写进你的 `~/.bashrc` 或 `~/.zshrc`：

```bash
# ~/.bashrc
export ALL_PROXY='socks5h://your-proxy-host:port'
export http_proxy="$ALL_PROXY"
export https_proxy="$ALL_PROXY"
```

然后：

```bash
# 确认能拉 github
curl -sS https://api.github.com | head -3
git -C <repo> fetch origin
```

### 2. 装 Node 20+ 和（可选）pm2

```bash
# 如果没有 node
# 推荐走 fnm / nvm 装到 $HOME，不需要 sudo
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 20 && fnm default 20

# 可选：pm2 用于进程管理 + 开机自动恢复（不需要 sudo）
npm config set prefix "$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"   # 加进 ~/.bashrc
npm i -g pm2
```

### 3. 配 `.env.local`（不进 git）

```bash
cd <repo>
cp .env.example .env.local
# 编辑 .env.local
#   SESSION_SECRET=<openssl rand -hex 32>
#   DEEPSEEK_API_KEY=            # 留空也 OK，每个用户到 /settings 自己填
```

### 4. 首次 build + 起服务

```bash
npm ci
npm run build

# 方式 A: 用 pm2
pm2 startOrReload ecosystem.config.cjs --only coc
pm2 save

# 方式 B: 不用 pm2
bash scripts/start-prod.sh
# 进程用 nohup 起在后台，日志在 ./prod.log
```

### 5. 开机自启

**有 pm2**：
```bash
pm2 startup        # 若提示需要 sudo，跳过；改用下面的 crontab
pm2 save           # 必做，把当前进程写进 pm2 resurrect list
```

**没 pm2 或 `pm2 startup` 需要 sudo 而你没有**：用 user crontab `@reboot`：
```bash
crontab -e
# 加上这一行（把路径换成你的）
@reboot sleep 30 && bash $HOME/.../COC/scripts/start-prod.sh
```

> 注：仅当 `loginctl show-user $USER | grep Linger=yes` 时，user crontab 的 `@reboot` 才会在你没登录时执行。
> 如果没有 linger，也可以请 sysadmin 给你的账号开一下 `loginctl enable-linger $USER`；或用 tmux/screen 会话、实验室每次重启手动起。

---

## 日常部署

### 手动

```bash
ssh <lab-server>
cd <repo>
bash scripts/deploy.sh
```

`deploy.sh` 做的事：
1. `git fetch origin main`
2. 如果没变化，直接退出
3. 有变化就 `git reset --hard origin/main`
4. 仅当 `package*.json` 改了才 `npm ci`
5. `npm run build`
6. pm2 reload，或 kill + 重启 `next start`

### 自动（可选）：cron 每 5 分钟检查一次

```bash
crontab -e
# 加这一行
*/5 * * * * flock -n /tmp/coc-deploy.lock bash $HOME/.../COC/scripts/deploy.sh >> $HOME/.../COC/deploy.log 2>&1
```

- `flock -n` 防并发重入
- 输出追加到 `deploy.log`
- 如果 HEAD 已经是最新，每次只花 1-2 秒做一次 `git fetch` 就退出，不会重新 build

---

## 访问

lab 内网通常 `http://<server-ip>:7878` 就能访问。外网访问需要：

- 向 sysadmin 申请端口开放，或
- 跑一个 reverse tunnel（例如 cloudflared / frp / ngrok）把 7878 反向暴露出去

如果只给你自己和同学用，**SSH tunnel 最省事**：

```bash
# 用户 A 从自己电脑：
ssh -L 7878:localhost:7878 user@<lab-server>
# 然后访问 http://localhost:7878
```

---

## 故障排查

| 症状 | 检查 |
|------|------|
| `git fetch` 卡住 / 超时 | 代理没生效：`curl -v https://github.com` 看是否真的走代理 |
| `npm ci` 下载包卡 | 同上；可选 `.npmrc` 里 `registry=https://registry.npmmirror.com` |
| `npm run build` OOM | 加 `NODE_OPTIONS=--max-old-space-size=2048 npm run build` |
| 服务起了但 7878 连不上 | `ss -tlnp \| grep :7878` 看有没有在监听；看 `prod.log` |
| pm2 意外停了 | `pm2 logs coc --lines 200` 看最后的错；多半是 `.env.local` 里 `SESSION_SECRET` 丢了 |
| 登录后每次都被踢出去 | `SESSION_SECRET` 被改过 → cookies 都失效了；让用户重新登录即可 |
| 部署后用户反馈 key 没了 | 同上：`SESSION_SECRET` 是 KEK，换了就解不开加密 key 了；重新去 `/settings` 填 |
| `deploy.log` 里看到 `npm ci` 反复运行 | 检查本地是否有未提交的 `package-lock.json` 改动 |

---

## Rollback

`deploy.sh` 是幂等的 —— 直接切回老 commit 就行：

```bash
cd <repo>
git log --oneline -n 10                    # 看提交
git reset --hard <old-sha>
npm ci && npm run build
pm2 reload coc        # 或 bash scripts/start-prod.sh
```

想禁用 cron 自动部署：

```bash
crontab -l | grep -v coc-deploy.lock | crontab -
```
