#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! /usr/local/bin/node --version >/dev/null 2>&1; then
  curl -fsSLo /tmp/node.tar.xz https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-x64.tar.xz
  curl -fsSLo /tmp/node-sha.txt https://nodejs.org/dist/v24.14.0/SHASUMS256.txt
  expected=$(awk '$2=="node-v24.14.0-linux-x64.tar.xz"{print $1}' /tmp/node-sha.txt)
  echo "$expected  /tmp/node.tar.xz" | sha256sum -c -
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
fi
id modolouge-worker >/dev/null 2>&1 || useradd --system --home /var/lib/modolouge --create-home --shell /usr/sbin/nologin modolouge-worker
chmod 700 /var/lib/modolouge
cd /opt/modolouge-worker
npm install --omit=dev --no-audit --no-fund
/usr/share/dotnet/dotnet publish tools/GhBridge/GhBridge.csproj -c Release -o tools/GhBridge/publish
cp component-policy.json tools/GhBridge/publish/component-policy.json
chown -R root:root /opt/modolouge-worker
chmod -R go-w /opt/modolouge-worker
cat >/etc/systemd/system/modolouge-worker.service <<'EOF'
[Unit]
Description=Modolouge job worker
After=network-online.target rhino-compute.service
Wants=network-online.target rhino-compute.service
[Service]
User=modolouge-worker
Group=modolouge-worker
WorkingDirectory=/opt/modolouge-worker
EnvironmentFile=/etc/rhino-compute/environment
EnvironmentFile=-/etc/modolouge-backend.env
Environment=COMPUTE_URL=http://127.0.0.1:5000
Environment=COMPUTE_TIMEOUT_MS=90000
ExecStart=/usr/local/bin/node /opt/modolouge-worker/worker.js
Restart=always
RestartSec=10
TimeoutStopSec=25
MemoryMax=1536M
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/modolouge
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
EOF
cat >/etc/systemd/system/modolouge-recovery.path <<'EOF'
[Unit]
Description=Watch for Modolouge timed-out solves
[Path]
PathExists=/var/lib/modolouge/restart-compute
Unit=modolouge-recovery.service
[Install]
WantedBy=multi-user.target
EOF
cat >/etc/systemd/system/modolouge-recovery.service <<'EOF'
[Unit]
Description=Restart Rhino after a timed-out Modolouge solve
[Service]
Type=oneshot
ExecStart=/usr/bin/rm -f /var/lib/modolouge/restart-compute
ExecStart=/usr/bin/systemctl restart rhino-compute
EOF
mkdir -p /etc/systemd/system/rhino-compute.service.d
cat >/etc/systemd/system/rhino-compute.service.d/modolouge-limits.conf <<'EOF'
[Service]
MemoryMax=5G
CPUQuota=350%
IPAddressDeny=169.254.169.254
IPAddressDeny=fd00:ec2::254
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
EOF
systemctl daemon-reload
systemctl restart rhino-compute
systemctl enable --now modolouge-worker
systemctl enable --now modolouge-recovery.path
systemctl is-active rhino-compute modolouge-worker
