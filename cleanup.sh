#!/bin/bash
pm2 flush >> ~/lamboapp/cleanup.log 2>&1
SIGLOG=~/lamboapp/signal-engine.log
if [ -f "$SIGLOG" ] && [ $(stat -c%s "$SIGLOG" 2>/dev/null || echo 0) -gt 52428800 ]; then
    truncate -s 0 "$SIGLOG"
fi
rm -rf ~/.cache/pip
sudo apt-get clean -y >> ~/lamboapp/cleanup.log 2>&1
sudo journalctl --vacuum-size=80M >> ~/lamboapp/cleanup.log 2>&1
echo "$(date): Cleanup done. Disk: $(df -h / | tail -1 | awk '{print $5}')" >> ~/lamboapp/cleanup.log
