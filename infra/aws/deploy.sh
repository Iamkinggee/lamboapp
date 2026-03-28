#!/bin/bash
# FILE: infra/aws/deploy.sh
# ═══════════════════════════════════════════════════════════════════════════════
# SMC Trading SaaS — AWS Free Tier Deployment Script
# ───────────────────────────────────────────────────
# Uses ONLY AWS Free Tier services (100% free for 12 months):
#   • EC2 t2.micro  — 750 hrs/month free
#   • ECR           — 500MB free (Docker image registry)
#   • S3            — 5GB free (web admin static hosting)
#   • CloudWatch    — 5GB logs free
#   • IAM           — Always free
#
# Prerequisites (install these first on your local machine):
#   1. AWS CLI v2    → https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
#   2. Docker Desktop → https://www.docker.com/products/docker-desktop/
#   3. Run: aws configure  (enter your AWS Access Key + Secret)
#
# Usage: chmod +x deploy.sh && ./deploy.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── CONFIGURATION — EDIT THESE ────────────────────────────────────────────────
AWS_REGION="us-east-1"           # Free tier available in all regions
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PROJECT="lamboapp"
KEY_PAIR_NAME="${PROJECT}-key"   # EC2 SSH key pair name
INSTANCE_TYPE="t2.micro"         # FREE TIER
AMI_ID="ami-0c02fb55956c7d316"   # Amazon Linux 2023 (us-east-1) — always free
S3_BUCKET="${PROJECT}-web-admin-$(echo $AWS_ACCOUNT_ID | tail -c 5)"

ECR_SIGNAL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT}/signal-engine"
ECR_API="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT}/api-server"
ECR_AI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT}/ai-assistant"

echo "═══════════════════════════════════════════════════"
echo "  SMC Trading SaaS — AWS Free Tier Deployment"
echo "  Account: $AWS_ACCOUNT_ID  Region: $AWS_REGION"
echo "═══════════════════════════════════════════════════"

# ── STEP 1: Create ECR repositories ──────────────────────────────────────────
echo ""
echo "▶ STEP 1: Creating ECR repositories..."
for repo in signal-engine api-server ai-assistant; do
  aws ecr describe-repositories --repository-names "${PROJECT}/${repo}" --region $AWS_REGION 2>/dev/null || \
  aws ecr create-repository \
    --repository-name "${PROJECT}/${repo}" \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true \
    --query 'repository.repositoryUri' --output text
  echo "  ✓ ECR repo: ${PROJECT}/${repo}"
done

# ── STEP 2: Build & push Docker images ───────────────────────────────────────
echo ""
echo "▶ STEP 2: Building and pushing Docker images to ECR..."

aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

build_and_push() {
  local service=$1
  local ecr_uri=$2
  echo "  Building ${service}..."
  docker build -t "${PROJECT}/${service}" "${REPO_ROOT}/services/${service}"
  docker tag "${PROJECT}/${service}:latest" "${ecr_uri}:latest"
  docker push "${ecr_uri}:latest"
  echo "  ✓ Pushed ${service} → ECR"
}

build_and_push "signal-engine" "$ECR_SIGNAL"
build_and_push "api-server"    "$ECR_API"
build_and_push "ai-assistant"  "$ECR_AI"

# ── STEP 3: Create IAM role for EC2 ──────────────────────────────────────────
echo ""
echo "▶ STEP 3: Setting up IAM role for EC2..."

ROLE_NAME="${PROJECT}-ec2-role"
aws iam get-role --role-name $ROLE_NAME 2>/dev/null || {
  aws iam create-role \
    --role-name $ROLE_NAME \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' > /dev/null

  # Attach ECR read, CloudWatch, SSM (for SSH-less access)
  aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
  aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
  aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

  aws iam create-instance-profile --instance-profile-name $ROLE_NAME > /dev/null
  aws iam add-role-to-instance-profile --instance-profile-name $ROLE_NAME --role-name $ROLE_NAME
  sleep 10  # IAM propagation delay
  echo "  ✓ IAM role created: $ROLE_NAME"
}

# ── STEP 4: Security Group ───────────────────────────────────────────────────
echo ""
echo "▶ STEP 4: Creating security group..."

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${PROJECT}-sg" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name "${PROJECT}-sg" \
    --description "SMC Trading SaaS security group" \
    --query 'GroupId' --output text)

  # Allow API (3001), AI (8000), WebSocket (3001), SSH (22)
  aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22   --cidr 0.0.0.0/0
  aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3001 --cidr 0.0.0.0/0
  aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 8000 --cidr 0.0.0.0/0
  echo "  ✓ Security group created: $SG_ID"
else
  echo "  ✓ Security group exists: $SG_ID"
fi

# ── STEP 5: Create key pair (if not exists) ───────────────────────────────────
echo ""
echo "▶ STEP 5: Creating EC2 key pair..."
if [ ! -f "${KEY_PAIR_NAME}.pem" ]; then
  aws ec2 create-key-pair \
    --key-name $KEY_PAIR_NAME \
    --query 'KeyMaterial' \
    --output text > "${KEY_PAIR_NAME}.pem"
  chmod 400 "${KEY_PAIR_NAME}.pem"
  echo "  ✓ Key pair saved: ${KEY_PAIR_NAME}.pem  ← KEEP THIS SAFE!"
else
  echo "  ✓ Key pair already exists: ${KEY_PAIR_NAME}.pem"
fi

# ── STEP 6: Launch EC2 t2.micro instance ─────────────────────────────────────
echo ""
echo "▶ STEP 6: Launching EC2 t2.micro (FREE TIER)..."

# User data script — runs on first boot
USER_DATA=$(cat << 'USERDATA_EOF'
#!/bin/bash
set -e
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Install Docker Compose
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# CloudWatch agent for logs
yum install -y amazon-cloudwatch-agent

# Login to ECR (uses instance role)
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
ACCOUNT=$(curl -s http://169.254.169.254/latest/meta-data/identity-credentials/ec2/info | python3 -c "import sys,json; print(json.load(sys.stdin)['AccountId'])")
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

# Signal that setup is complete
echo "SETUP_COMPLETE" > /tmp/setup_status
USERDATA_EOF
)

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type $INSTANCE_TYPE \
  --key-name $KEY_PAIR_NAME \
  --security-group-ids $SG_ID \
  --iam-instance-profile Name=$ROLE_NAME \
  --user-data "$USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-server},{Key=Project,Value=${PROJECT}}]" \
  --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":8,\"VolumeType\":\"gp2\"}}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "  ✓ EC2 launched: $INSTANCE_ID"
echo "  ⏳ Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "  ✓ EC2 running! Public IP: $PUBLIC_IP"

# ── STEP 7: Deploy docker-compose on EC2 ─────────────────────────────────────
echo ""
echo "▶ STEP 7: Deploying services on EC2..."
echo "  ⏳ Waiting 60s for EC2 user-data script to complete..."
sleep 60

# Copy .env and docker-compose.aws.yml to EC2
scp -i "${KEY_PAIR_NAME}.pem" -o StrictHostKeyChecking=no \
  "${REPO_ROOT}/.env" \
  "${REPO_ROOT}/infra/aws/docker-compose.aws.yml" \
  "ec2-user@${PUBLIC_IP}:/home/ec2-user/"

# SSH and start services
ssh -i "${KEY_PAIR_NAME}.pem" -o StrictHostKeyChecking=no "ec2-user@${PUBLIC_IP}" << EOF
  cd /home/ec2-user
  REGION="${AWS_REGION}" ACCOUNT="${AWS_ACCOUNT_ID}" docker-compose -f docker-compose.aws.yml up -d
  docker-compose -f docker-compose.aws.yml ps
EOF

# ── STEP 8: S3 static hosting for Web Admin ──────────────────────────────────
echo ""
echo "▶ STEP 8: Deploying Web Admin to S3 static hosting (FREE)..."

aws s3 mb "s3://${S3_BUCKET}" --region $AWS_REGION 2>/dev/null || true

aws s3 website "s3://${S3_BUCKET}" \
  --index-document index.html \
  --error-document index.html

# Make public
aws s3api put-bucket-policy --bucket $S3_BUCKET --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"PublicReadGetObject\",
    \"Effect\": \"Allow\",
    \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::${S3_BUCKET}/*\"
  }]
}"

aws s3 sync "${REPO_ROOT}/apps/web-admin/" "s3://${S3_BUCKET}/" --delete

ADMIN_URL="http://${S3_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"
echo "  ✓ Web Admin live at: $ADMIN_URL"

# ── DONE ─────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════"
echo "  EC2 IP:       $PUBLIC_IP"
echo "  API Server:   http://${PUBLIC_IP}:3001"
echo "  AI Mentor:    http://${PUBLIC_IP}:8000"
echo "  WebSocket:    ws://${PUBLIC_IP}:3001/ws"
echo "  Web Admin:    $ADMIN_URL"
echo ""
echo "  SSH access:"
echo "  ssh -i ${KEY_PAIR_NAME}.pem ec2-user@${PUBLIC_IP}"
echo ""
echo "  ⚠️  Save your EC2 key: ${KEY_PAIR_NAME}.pem"
echo "  ⚠️  FREE TIER: t2.micro 750 hrs/month (12 months)"
echo "═══════════════════════════════════════════════════"