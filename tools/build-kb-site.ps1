$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$kbRoot = Join-Path $repoRoot "knowledge_base"
$siteRoot = Join-Path $repoRoot "site"
$dataPath = Join-Path $siteRoot "kb-data.js"

if (-not (Test-Path $kbRoot)) {
    throw "knowledge_base folder was not found at $kbRoot"
}

if (-not (Test-Path $siteRoot)) {
    New-Item -ItemType Directory -Force $siteRoot | Out-Null
}

function Read-Utf8File {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Parse-Scalar {
    param([string]$Value)

    $trimmed = $Value.Trim()
    if ($trimmed -eq "") { return "" }
    if ($trimmed -eq "true") { return $true }
    if ($trimmed -eq "false") { return $false }
    if ($trimmed -match '^\[(.*)\]$') {
        $inside = $Matches[1].Trim()
        if ($inside -eq "") { return @() }
        return @(
            $inside -split "," |
                ForEach-Object { $_.Trim().Trim('"').Trim("'") } |
                Where-Object { $_ -ne "" }
        )
    }
    return $trimmed.Trim('"').Trim("'")
}

function Parse-Frontmatter {
    param([string]$Text)

    $frontmatter = [ordered]@{}
    $body = $Text
    if ($Text -match '(?s)^---\r?\n(.*?)\r?\n---\r?\n?(.*)$') {
        $body = $Matches[2]
        $lines = $Matches[1] -split "\r?\n"
        foreach ($line in $lines) {
            if ($line -match '^\s*#') { continue }
            if ($line -match '^\s*([^:]+):\s*(.*)$') {
                $key = $Matches[1].Trim()
                $value = Parse-Scalar $Matches[2]
                $frontmatter[$key] = $value
            }
        }
    }

    return @{
        Frontmatter = $frontmatter
        Body = $body.Trim()
    }
}

function Get-Title {
    param(
        [hashtable]$Frontmatter,
        [string]$Body,
        [string]$Slug
    )

    foreach ($key in @("lemma", "name", "title")) {
        if ($Frontmatter.Contains($key) -and "$($Frontmatter[$key])" -ne "") {
            return "$($Frontmatter[$key])"
        }
    }

    $heading = [regex]::Match($Body, '(?m)^#\s+(.+)$')
    if ($heading.Success) {
        return $heading.Groups[1].Value.Trim()
    }

    return $Slug
}

function Get-Excerpt {
    param([string]$Body)

    $text = $Body -replace '(?m)^#{1,6}\s+', ''
    $text = $text -replace '\[\[([^\]|]+)\|?([^\]]*)\]\]', '$1'
    $text = $text -replace '[`*_>#|-]', ' '
    $text = $text -replace '\s+', ' '
    $text = $text.Trim()
    if ($text.Length -gt 220) {
        return $text.Substring(0, 220)
    }
    return $text
}

function Get-Wikilinks {
    param([string]$Text)

    return @(
        [regex]::Matches($Text, '\[\[([^\]|]+)(?:\|[^\]]+)?\]\]') |
            ForEach-Object { $_.Groups[1].Value.Trim() } |
            Sort-Object -Unique
    )
}

function Get-RelativePath {
    param(
        [string]$Root,
        [string]$Path
    )

    $rootFullPath = [System.IO.Path]::GetFullPath($Root).TrimEnd("\", "/")
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if ($fullPath.StartsWith($rootFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $fullPath.Substring($rootFullPath.Length).TrimStart("\", "/")
    }
    return $fullPath
}

$notes = New-Object System.Collections.Generic.List[object]
$files = Get-ChildItem -Path $kbRoot -Recurse -File -Filter "*.md" |
    Where-Object { $_.FullName -notmatch [regex]::Escape((Join-Path $kbRoot "_templates")) } |
    Sort-Object FullName

foreach ($file in $files) {
    $text = Read-Utf8File $file.FullName
    $parsed = Parse-Frontmatter $text
    $frontmatter = $parsed.Frontmatter
    $body = $parsed.Body
    $relativePath = (Get-RelativePath $repoRoot $file.FullName).Replace("\", "/")
    $slug = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $parentType = Split-Path -Leaf (Split-Path -Parent $file.FullName)
    $type = if ($frontmatter.Contains("type") -and "$($frontmatter["type"])" -ne "") { "$($frontmatter["type"])" } else { $parentType.TrimEnd("s") }
    $title = Get-Title $frontmatter $body $slug

    $note = [ordered]@{
        slug = $slug
        type = $type
        title = $title
        path = $relativePath
        body = $body
        excerpt = Get-Excerpt $body
        links = Get-Wikilinks $text
        searchText = "$title $slug $relativePath $text"
    }

    foreach ($key in @("lemma", "name", "ordklass", "cefr", "zh", "en", "created", "known")) {
        if ($frontmatter.Contains($key)) {
            $note[$key] = $frontmatter[$key]
        }
    }

    $notes.Add([pscustomobject]$note) | Out-Null
}

$data = [ordered]@{
    generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    notes = $notes
}

$json = $data | ConvertTo-Json -Depth 8
$javascript = "window.KB_DATA = $json;`n"
[System.IO.File]::WriteAllText($dataPath, $javascript, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Generated $dataPath with $($notes.Count) notes."
