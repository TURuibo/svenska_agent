<#
.SYNOPSIS
  SessionStart hook: 检测本地分支与其 GitHub 上游的差距，安全时自动 pull。

  规则（保守，绝不破坏本地工作）：
    - 纯落后 (behind>0, ahead=0)         → 自动 `git pull --ff-only`（快进，最安全）
    - 分叉   (behind>0, ahead>0)         → 只警告，不自动合并/变基（留给 /sync 或手动处理）
    - 纯领先 (ahead>0, behind=0)         → 提示有未推送提交，建议 /sync
    - 已最新                              → 安静（一行）
  另外：仓库正在 rebase/merge 中、无上游、fetch 超时/失败 → 跳过，不打扰。
#>

$ErrorActionPreference = 'SilentlyContinue'
$env:GIT_TERMINAL_PROMPT = '0'   # 禁止凭据弹窗导致挂起

# 项目根 = 本脚本所在的 .claude\hooks\ 往上两级
$Root = Split-Path (Split-Path $PSScriptRoot)
Set-Location $Root

# 必须是 git 仓库
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { exit 0 }

# 正在 rebase / merge 中 → 不插手
if ((Test-Path (Join-Path $Root '.git\rebase-merge')) -or
    (Test-Path (Join-Path $Root '.git\rebase-apply')) -or
    (Test-Path (Join-Path $Root '.git\MERGE_HEAD'))) {
  Write-Output "git: 仓库正处于 rebase/merge 中，跳过自动 pull"
  exit 0
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()

# 解析上游（如 origin/main）；没有上游就跳过
$upstream = (git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null)
if (-not $upstream) { exit 0 }
$upstream = $upstream.Trim()
$remote   = $upstream.Split('/')[0]

# fetch，套 15s 超时（offline / 慢网不阻塞会话启动）
$job = Start-Job -ScriptBlock {
  param($r, $rm, $br)
  Set-Location $r
  $env:GIT_TERMINAL_PROMPT = '0'
  git fetch --quiet $rm $br 2>&1
} -ArgumentList $Root, $remote, $branch
if (Wait-Job $job -Timeout 15) { Receive-Job $job | Out-Null }
else { Stop-Job $job; Remove-Job $job -Force; Write-Output "git: fetch 超时(>15s)，跳过自动 pull"; exit 0 }
Remove-Job $job -Force

# 计算 ahead / behind： left=本地独有(ahead)  right=上游独有(behind)
$counts = (git rev-list --left-right --count "HEAD...$upstream").Trim() -split '\s+'
$ahead  = [int]$counts[0]
$behind = [int]$counts[1]

if ($behind -eq 0 -and $ahead -eq 0) {
  Write-Output "✅ git: 与 $upstream 同步"
  exit 0
}

if ($behind -gt 0 -and $ahead -eq 0) {
  # 纯落后 → 快进 pull（dirty 工作区时 git 会自动 stash 再恢复）
  $out = git pull --ff-only --autostash $remote $branch 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Write-Output "⬇️ git: 自动 pull 成功，已快进 $behind 个提交（$upstream → 本地）"
  } else {
    Write-Output "⚠️ git: 落后 $behind 个提交但快进失败，请手动 git pull --rebase。详情：$($out.Trim())"
  }
  exit 0
}

if ($behind -gt 0 -and $ahead -gt 0) {
  Write-Output "⚠️ git: 与 $upstream 分叉（本地领先 $ahead、落后 $behind）。未自动合并——请运行 /sync 或 git pull --rebase 手动解决。"
  exit 0
}

# ahead>0, behind=0
Write-Output "⬆️ git: 本地领先 $upstream $ahead 个提交（有未推送内容）——运行 /sync 推送到 GitHub。"
exit 0
