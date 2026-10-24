#!/usr/bin/env bash
# 第二轮修复后的整套回归（顺序跑，避免多个 headless Edge 抢 CPU）。
set -u
cd "$(dirname "$0")/.."
mkdir -p _pt/lead_round2
run() {
  local name="$1"; shift
  echo "===== $name ====="
  node "$@" 2>&1 | tail -6
  echo
}
run "主回归(_pt_lead_regression)" tools/_pt_lead_regression.mjs
run "阶段验收(_lead_accept)" tools/_lead_accept.mjs
run "暂停/静音/改键(_lead_fixcheck2)" tools/_lead_fixcheck2.mjs 9493
run "暂停光标(_lead_pauseidx)" tools/_lead_pauseidx.mjs
run "检查点审计(_audit_checkpoints)" tools/_audit_checkpoints.mjs
run "第5面妖梦(_verify_stage5_youmu)" tools/_verify_stage5_youmu.mjs
run "存档迁移(_audit2_migrate)" tools/_audit2_migrate.mjs 9729
run "进关卡顿(_lead_stage_load)" tools/_lead_stage_load.mjs
