#!/bin/bash
cd ~/lamboapp/services/signal-engine
export HTTPX_LOG_LEVEL=WARNING
pkill -f "python3 main.py" 2>/dev/null
sleep 1
nohup python3 main.py >> ~/lamboapp/signal-engine.log 2>&1 &
echo $! > ~/lamboapp/signal-engine.pid
echo "Signal engine started — PID: $(cat ~/lamboapp/signal-engine.pid)"
