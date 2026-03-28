# SMC Trading SaaS — LAMBOAPP
## Complete Setup, Run & Deploy Guide

---

## 📁 Project Structure

```
lamboapp/
├── apps/
│   ├── mobile/              ← React Native (Expo) mobile app
│   └── web-admin/           ← Admin dashboard (index.html)
├── services/
│   ├── signal-engine/       ← Python SMC engine
│   ├── api-server/          ← Node.js Fastify API + WebSocket
│   └── ai-assistant/        ← Python FastAPI AI mentor
├── infra/
│   ├── docker-compose.yml   ← Local dev environment
│   └── aws/                 ← AWS deployment configs
├── .env.example             ← Environment variables template
└── .github/workflows/       ← CI/CD auto-deploy on git push
```

---

## 🔑 STEP 1 — Get Your Free API Keys (15 minutes)

Do these first. All are 100% free.

### 1a. Supabase (Database + Auth)
1. Go to **supabase.com** → Sign up → New Project
2. Choose a region close to you, set a strong DB password
3. Go to **Settings → API**
4. Copy: `Project URL`, `anon public key`, `service_role key`
5. Go to **SQL Editor** → paste contents of `infra/aws/supabase_schema.sql` → Run

### 1b. Upstash Redis (Pub/Sub + Cache)
1. Go to **upstash.com** → Sign up → Create Database
2. Choose **Global** replication, select **Free** tier
3. Copy the **Redis URL** (starts with `rediss://`)

### 1c. Groq (Primary AI — FREE)
1. Go to **console.groq.com** → Sign up
2. API Keys → Create API Key
3. Copy the key (starts with `gsk_`)

### 1d. Anthropic Claude (Fallback AI)
1. Go to **console.anthropic.com** → Sign up
2. Get API Key (starts with `sk-ant-`)
3. Add $5 credit (optional — only used as fallback)

### 1e. Firebase FCM (Push Notifications — FREE)
1. Go to **console.firebase.google.com** → New Project
2. Project Settings → Cloud Messaging → Server Key
3. Copy the Server Key

---

## ⚙️ STEP 2 — Configure Environment Variables

```bash
# In your project root:
cp .env.example .env
```

Open `.env` and fill in all the values from Step 1.

---

## 💻 STEP 3 — Run Locally (Fastest Way)

**Requirements:** Docker Desktop installed and running.

```bash
# From the project root:
cd lamboapp

# Start everything (signal engine + API + AI + Redis + web admin)
docker-compose -f infra/docker-compose.yml up --build

# You'll see logs from all 5 services in one terminal.
# Wait for: "✅ Binance WebSocket connected"
```

**Local URLs once running:**
| Service     | URL                         |
|-------------|-----------------------------|
| API Server  | http://localhost:3001        |
| AI Mentor   | http://localhost:8000        |
| Web Admin   | http://localhost:8080        |
| Health      | http://localhost:3001/health |

**To stop:**
```bash
docker-compose -f infra/docker-compose.yml down
```

---

## 📱 STEP 4 — Run the Mobile App

**Requirements:** Node.js 20+, Expo CLI

```bash
# Install Expo CLI globally (one time)
npm install -g expo-cli eas-cli

# Navigate to mobile app
cd apps/mobile

# Install dependencies
npm install

# Update API URL in apps/mobile/services/api.ts:
# API_BASE_URL = "http://YOUR_LOCAL_IP:3001"  ← use your machine's local IP, not localhost

# Start Expo dev server
npx expo start
```

**On your phone:**
1. Install **Expo Go** from App Store / Google Play
2. Scan the QR code shown in terminal
3. The app loads live on your phone instantly

---

## ☁️ STEP 5 — Deploy to AWS Free Tier

**Requirements:**
- AWS account (free at aws.amazon.com — credit card required but NOT charged)
- AWS CLI v2 installed: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
- Docker Desktop running

```bash
# 1. Configure AWS CLI (one time)
aws configure
# Enter: Access Key ID, Secret Key, Region (us-east-1), output (json)
# Get keys from: AWS Console → IAM → Users → Your User → Security Credentials

# 2. Make deploy script executable
chmod +x infra/aws/deploy.sh

# 3. Run the full deployment (takes ~10 minutes)
cd infra/aws
./deploy.sh
```

The script automatically:
- ✅ Creates ECR repos and pushes Docker images
- ✅ Launches EC2 t2.micro (FREE TIER)
- ✅ Sets up security groups and IAM roles
- ✅ Deploys all 3 services via Docker on EC2
- ✅ Hosts Web Admin on S3 (FREE static hosting)
- ✅ Configures CloudWatch logging

**At the end, you'll see:**
```
✅ DEPLOYMENT COMPLETE!
EC2 IP:     52.x.x.x
API Server: http://52.x.x.x:3001
AI Mentor:  http://52.x.x.x:8000
Web Admin:  http://lamboapp-web-admin-xxxx.s3-website-us-east-1.amazonaws.com
```

Update `.env` in your mobile app with the EC2 IP address, then rebuild.

---

## 🔄 STEP 6 — Auto-Deploy on Git Push (CI/CD)

```bash
# Add these secrets in GitHub:
# → Your repo → Settings → Secrets and variables → Actions → New secret

# Secrets to add:
AWS_ACCESS_KEY_ID       ← from AWS IAM
AWS_SECRET_ACCESS_KEY   ← from AWS IAM
EC2_HOST                ← your EC2 public IP (e.g. 52.x.x.x)
EC2_KEY                 ← contents of your lamboapp-key.pem file
S3_BUCKET               ← your S3 bucket name (shown in deploy output)
```

After adding secrets, every push to `main` branch:
1. Builds Docker images → pushes to ECR
2. SSH into EC2 → pulls new images → restarts services
3. Syncs web admin → S3

```bash
git add .
git commit -m "Update signal engine config"
git push origin main
# → GitHub Actions runs automatically → live in ~5 minutes
```

---

## 📲 STEP 7 — Build Mobile App for Download

```bash
cd apps/mobile

# Login to Expo
eas login

# Configure your app (one time)
eas build:configure

# Build for Android (APK — direct download, FREE)
eas build --platform android --profile preview
# → Produces a .apk file anyone can download and install

# Build for iOS (requires Apple Developer account - $99/year)
eas build --platform ios

# Build for both
eas build --platform all
```

**Share your app:**
- Android APK: Share the download link Expo gives you — anyone can install it
- For Google Play Store: Use `--profile production` and submit via Play Console
- For Apple App Store: Requires Apple Developer account

---

## 🆓 AWS Free Tier Breakdown

| Service        | Free Tier                        | Notes                          |
|----------------|----------------------------------|--------------------------------|
| EC2 t2.micro   | 750 hours/month for 12 months    | Enough for 1 always-on server  |
| ECR            | 500MB storage free               | More than enough for 3 images  |
| S3             | 5GB storage + 20K GET requests   | Web admin static hosting       |
| CloudWatch     | 5GB log ingestion/month          | All service logs               |
| IAM            | Always free                      | Roles and permissions          |
| Data transfer  | 1GB outbound/month free          | Monitor if app grows           |

**After 12 months:** EC2 t2.micro = ~$8.50/month. Or use **AWS Lightsail** $3.50/month.

---

## 🔧 Useful Commands

```bash
# Check all running containers on EC2
ssh -i lamboapp-key.pem ec2-user@YOUR_EC2_IP
docker ps

# View live logs
docker logs -f smc-signal-engine
docker logs -f smc-api-server
docker logs -f smc-ai-assistant

# Restart a service
docker restart smc-signal-engine

# Pull latest images and redeploy manually
docker-compose -f docker-compose.aws.yml pull
docker-compose -f docker-compose.aws.yml up -d

# Check Redis signal count
docker exec smc-redis redis-cli ZCARD signals:history
```

---

## 🚨 Security Checklist Before Going Live

- [ ] `.env` is in `.gitignore` — never committed
- [ ] JWT_SECRET is a random 64-char string (not the example value)
- [ ] Supabase RLS is enabled (done by the SQL schema)
- [ ] AWS IAM user has only necessary permissions
- [ ] EC2 security group only opens ports 3001, 8000, 22
- [ ] Rotate the default `CHANGE_ME` JWT secret

---

*Stack: Python 3.11 · Node.js 20 · React Native Expo · Supabase · Upstash Redis · Groq · AWS Free Tier*
*All tools free-tier or open-source — no paid subscriptions required for MVP.*