#!/usr/bin/env bash
# Sourced by run.sh. Each service gets its own process group, including descendants.
set -m
omni_pids=()
omni_names=()
omni_logs=()
omni_stopping=0

omni_start_service() {
  local name="$1" logfile="$2"
  shift 2
  "$@" > "$logfile" 2>&1 &
  omni_pids+=("$!")
  omni_names+=("$name")
  omni_logs+=("$logfile")
}

omni_check_services() {
  local index
  for index in "${!omni_pids[@]}"; do
    if ! kill -0 "${omni_pids[$index]}" 2>/dev/null; then
      echo "${omni_names[$index]} stopped. See ${omni_logs[$index]}" >&2
      return 1
    fi
  done
}

omni_stop_services() {
  [[ "$omni_stopping" -eq 0 ]] || return 0
  omni_stopping=1
  local pid deadline any_alive
  local groups=()
  # A group can outlive its npm/Cargo leader. Keep groups created by this shell
  # so orphan descendants are still stopped after the leader has exited.
  if [[ ${#omni_pids[@]} -gt 0 ]]; then
    for pid in "${omni_pids[@]}"; do groups+=("$pid"); done
  fi
  if [[ -n "${omni_native_pid:-}" ]]; then groups+=("$omni_native_pid"); fi
  [[ ${#groups[@]} -gt 0 ]] || return 0
  for pid in "${groups[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
  deadline=$((SECONDS + 3))
  while [[ $SECONDS -lt $deadline ]]; do
    any_alive=0
    for pid in "${groups[@]}"; do
      if kill -0 -- "-$pid" 2>/dev/null; then any_alive=1; fi
    done
    [[ $any_alive -eq 1 ]] || break
    sleep 0.1
  done
  for pid in "${groups[@]}"; do kill -KILL -- "-$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
