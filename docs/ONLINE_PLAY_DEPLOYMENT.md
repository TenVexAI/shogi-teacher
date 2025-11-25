# Online Play Server Deployment Guide

This guide covers deploying the Shogi Teacher connection server to a DigitalOcean Droplet.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [DigitalOcean Droplet Setup](#digitalocean-droplet-setup)
3. [Domain & SSL Configuration](#domain--ssl-configuration)
4. [OAuth App Registration](#oauth-app-registration)
5. [Server Deployment](#server-deployment)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- [ ] DigitalOcean account with billing configured
- [ ] Domain name (recommended: subdomain like `online.yourdomain.com`)
- [ ] SSH key pair for server access
- [ ] GitHub/GitLab account (for deployment)
- [ ] Accounts on Twitch, Discord, GitHub (for OAuth app registration)

---

## DigitalOcean Droplet Setup

### 1. Create Droplet

1. Log into [DigitalOcean Console](https://cloud.digitalocean.com/)
2. Click **Create** → **Droplets**
3. Configure:
   - **Region**: Choose closest to your primary user base
   - **Image**: Ubuntu 22.04 LTS
   - **Size**: Basic → Regular → $6/mo (1 GB RAM, 1 vCPU)
     - Can scale up later if needed
   - **Authentication**: SSH Key (recommended)
   - **Hostname**: `shogi-online` or similar

4. Click **Create Droplet**
5. Note the IP address once created

### 2. Initial Server Setup

SSH into your new droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Run initial setup:

```bash
# Update system
apt update && apt upgrade -y

# Create non-root user
adduser shogi
usermod -aG sudo shogi

# Set up SSH for new user
mkdir -p /home/shogi/.ssh
cp ~/.ssh/authorized_keys /home/shogi/.ssh/
chown -R shogi:shogi /home/shogi/.ssh
chmod 700 /home/shogi/.ssh
chmod 600 /home/shogi/.ssh/authorized_keys

# Configure firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker shogi

# Install Docker Compose
apt install docker-compose-plugin -y

# Reboot to apply all changes
reboot
```

After reboot, SSH as the new user:

```bash
ssh shogi@YOUR_DROPLET_IP
```

---

## Domain & SSL Configuration

### 1. Configure DNS

Add an A record pointing to your droplet:

| Type | Name | Value |
|------|------|-------|
| A | online | YOUR_DROPLET_IP |

If your domain is `shogi-teacher.com`, this creates `online.shogi-teacher.com`.

### 2. Install Nginx & Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

### 3. Configure Nginx

Create `/etc/nginx/sites-available/shogi-online`:

```nginx
server {
    listen 80;
    server_name online.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # WebSocket timeout
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/shogi-online /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Obtain SSL Certificate

```bash
sudo certbot --nginx -d online.yourdomain.com
```

Follow the prompts. Certbot will:
- Obtain the certificate
- Configure Nginx for HTTPS
- Set up auto-renewal

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

---

## OAuth App Registration

### Twitch OAuth App

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Click **Register Your Application**
3. Configure:
   - **Name**: Shogi Teacher Online
   - **OAuth Redirect URLs**: `https://online.yourdomain.com/auth/twitch/callback`
   - **Category**: Game Integration
4. Click **Create**
5. Note the **Client ID** and generate a **Client Secret**

### Discord OAuth App

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Name it "Shogi Teacher Online"
4. Go to **OAuth2** → **General**
5. Add Redirect: `https://online.yourdomain.com/auth/discord/callback`
6. Note the **Client ID** and **Client Secret**
7. Under **OAuth2** → **Scopes**, select: `identify`

### GitHub OAuth App

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Configure:
   - **Application name**: Shogi Teacher Online
   - **Homepage URL**: `https://yourdomain.com`
   - **Authorization callback URL**: `https://online.yourdomain.com/auth/github/callback`
4. Click **Register application**
5. Note the **Client ID** and generate a **Client Secret**

---

## Server Deployment

### 1. Clone Repository

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/shogi-teacher.git
cd shogi-teacher/server
```

### 2. Create Environment File

Create `.env` file:

```bash
nano .env
```

Add your credentials:

```env
# Server
SERVER_SECRET_KEY=your-secure-random-string-here
CORS_ORIGINS=https://yourdomain.com,http://localhost:3000

# Twitch OAuth
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
TWITCH_REDIRECT_URI=https://online.yourdomain.com/auth/twitch/callback

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=https://online.yourdomain.com/auth/discord/callback

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=https://online.yourdomain.com/auth/github/callback
```

Generate a secure secret key:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Secure the file:

```bash
chmod 600 .env
```

### 3. Build and Run with Docker

```bash
# Build the image
docker compose build

# Start in detached mode
docker compose up -d

# Check logs
docker compose logs -f
```

### 4. Verify Deployment

Check the health endpoint:

```bash
curl https://online.yourdomain.com/health
```

Expected response:

```json
{"status": "healthy", "users_online": 0}
```

### 5. Set Up Auto-Start

Docker Compose services restart automatically if configured properly. Verify in `docker-compose.yml`:

```yaml
services:
  server:
    restart: unless-stopped
```

---

## Monitoring & Maintenance

### View Logs

```bash
# All logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Specific time range
docker compose logs --since="2024-01-01T00:00:00"
```

### Server Statistics

The server exposes a stats endpoint (authenticated):

```bash
curl https://online.yourdomain.com/admin/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Update Server

```bash
cd ~/shogi-teacher

# Pull latest code
git pull

# Rebuild and restart
cd server
docker compose down
docker compose build
docker compose up -d
```

### Backup (Optional)

The server is stateless by design - no persistent data to backup. OAuth tokens are session-only.

### Monitoring Services (Optional)

For production monitoring, consider:

1. **DigitalOcean Monitoring**: Built-in, enable in droplet settings
2. **Uptime Monitoring**: Use [UptimeRobot](https://uptimerobot.com/) (free tier available)
3. **Log Aggregation**: [Papertrail](https://www.papertrail.com/) or similar

---

## Troubleshooting

### WebSocket Connection Fails

1. Check Nginx is running:
   ```bash
   sudo systemctl status nginx
   ```

2. Check server is running:
   ```bash
   docker compose ps
   ```

3. Check Nginx error logs:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

4. Verify WebSocket upgrade headers in Nginx config

### OAuth Callback Fails

1. Verify redirect URIs match exactly (including trailing slashes)
2. Check environment variables are loaded:
   ```bash
   docker compose exec server env | grep -i client
   ```

3. Check server logs for OAuth errors:
   ```bash
   docker compose logs server | grep -i oauth
   ```

### SSL Certificate Issues

1. Check certificate status:
   ```bash
   sudo certbot certificates
   ```

2. Force renewal:
   ```bash
   sudo certbot renew --force-renewal
   ```

3. Verify Nginx SSL config:
   ```bash
   sudo nginx -t
   ```

### High Memory Usage

If the server uses too much memory:

1. Check connected users:
   ```bash
   curl https://online.yourdomain.com/health
   ```

2. Restart to clear memory:
   ```bash
   docker compose restart
   ```

3. Consider upgrading droplet if consistent issue

### Connection Drops

1. Check for Nginx timeout issues (increase `proxy_read_timeout`)
2. Verify Docker container isn't being OOM killed:
   ```bash
   dmesg | grep -i oom
   ```

3. Check network connectivity:
   ```bash
   ping google.com
   ```

---

## Security Checklist

- [ ] SSH key authentication only (disable password auth)
- [ ] Firewall enabled (ufw)
- [ ] Non-root user for running services
- [ ] SSL/TLS enabled for all traffic
- [ ] Environment variables secured (chmod 600)
- [ ] CORS configured properly
- [ ] Rate limiting enabled (in application)
- [ ] Regular system updates scheduled

### Enable Automatic Security Updates

```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Scaling Considerations

For future growth:

### Vertical Scaling
- Upgrade droplet size through DigitalOcean console
- Zero downtime with resize option

### Horizontal Scaling
If needed later:
1. Add Redis for shared session state
2. Deploy multiple server instances
3. Use DigitalOcean Load Balancer
4. Consider managed Kubernetes (DOKS)

Current architecture (in-memory) supports ~500-1000 concurrent users on a $6/mo droplet.

---

## Cost Estimate

| Component | Monthly Cost |
|-----------|--------------|
| DigitalOcean Droplet (1GB) | $6 |
| Domain (annual, amortized) | ~$1 |
| SSL Certificate (Let's Encrypt) | Free |
| **Total** | **~$7/month** |

Scale up to $12/mo droplet (2GB RAM) if needed for more users.

---

## Quick Reference Commands

```bash
# SSH to server
ssh shogi@online.yourdomain.com

# View server logs
cd ~/shogi-teacher/server && docker compose logs -f

# Restart server
cd ~/shogi-teacher/server && docker compose restart

# Update and restart
cd ~/shogi-teacher && git pull && cd server && docker compose down && docker compose build && docker compose up -d

# Check SSL certificate
sudo certbot certificates

# Check server status
curl https://online.yourdomain.com/health
```
