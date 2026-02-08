# Large File Handling in Claude Code

## Thresholds & Limits

### Read Tool (primary file reading)

| Limit | Value | Purpose |
|-------|-------|---------|
| **Max file size** | **262,144 bytes (256 KB)** | Hard limit — files larger than this are rejected outright |
| Default line limit | 2,000 lines | Read returns up to 2,000 lines per call |
| Line truncation | 2,000 chars/line | Lines longer than this get truncated |

### Other output limits

| Limit | Value |
|-------|-------|
| Bash output (default) | 30,000 chars |
| Bash output (max cap) | 150,000 chars |
| MCP output tokens | 25,000 tokens (default), hard cap at 100,000 |
| Git status output | 40,000 chars |
| Query helper output | 10,000 chars |

## How It Works When a File Is Too Large

### 1. Size check (256 KB threshold)

When the Read tool is called, the file size is checked against `262,144 bytes`. If exceeded, it throws an error:

> "File content (X) exceeds maximum allowed size (256 KB). Please use offset and limit parameters to read specific portions of the file, or use the GrepTool to search for specific content."

### 2. Token count check

Even if under 256 KB, there's a secondary check via `MaxFileReadTokenExceededError` — if the content's estimated token count (calculated as `string.length / 4`) exceeds the max tokens, it also rejects the read.

### 3. Chunked reading strategy

When output is too large (from any tool), CC saves the output to a temp file and instructs the model to read it in chunks:

```
Error: result (N characters) exceeds maximum allowed tokens.
Output has been saved to <path>.

Use offset and limit parameters to read specific portions of the file,
the GrepTool to search for specific content, and jq to make structured queries.

REQUIREMENTS FOR SUMMARIZATION/ANALYSIS/REVIEW:
- You MUST read the content from the file at <path> in sequential chunks
  until 100% of the content has been read.
```

### 4. Line-level truncation

Each line is capped at 2,000 characters. Anything beyond is silently truncated.

### 5. Bash output truncation

Bash output is capped at 30,000 chars by default (configurable via `BASH_MAX_OUTPUT_LENGTH` env var, hard-capped at 150,000). Output beyond the limit is truncated.

## Implementation Guide

The core pattern to replicate:

1. **Gate**: Check file size before reading (256 KB = `262144` bytes)
2. **Paginate**: Use `offset` + `limit` params to read large files in windows of ~2,000 lines
3. **Truncate lines**: Cap individual lines at 2,000 chars
4. **Fallback to search**: When a file is too big to read entirely, direct the model to use Grep/search tools instead
5. **Spill to disk**: When tool output exceeds token limits, save to a temp file and instruct the model to read it in chunks
6. **Token estimation**: Use the simple heuristic `tokens ≈ string.length / 4`

## Reference: Key Code Patterns

### File size check

```javascript
const MAX_FILE_SIZE = 262144; // 256 KB

function checkFileSize(fileSizeBytes) {
  if (fileSizeBytes > MAX_FILE_SIZE) {
    throw new Error(
      `File content (${formatBytes(fileSizeBytes)}) exceeds maximum allowed size (${formatBytes(MAX_FILE_SIZE)}). ` +
      `Please use offset and limit parameters to read specific portions of the file, ` +
      `or use the GrepTool to search for specific content.`
    );
  }
}
```

### Token estimation

```javascript
function estimateTokens(text) {
  return Math.round(text.length / 4);
}
```

### Line truncation

```javascript
const MAX_LINE_LENGTH = 2000;
const DEFAULT_LINE_LIMIT = 2000;

function truncateLines(content) {
  return content
    .split('\n')
    .slice(0, DEFAULT_LINE_LIMIT)
    .map(line => line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) : line)
    .join('\n');
}
```

### Large output spill-to-disk

```javascript
const MAX_OUTPUT_CHARS = 30000;

function handleLargeOutput(output, format) {
  if (output.length <= MAX_OUTPUT_CHARS) return output;

  const tmpPath = saveToDisk(output);
  return (
    `Error: result (${output.length.toLocaleString()} characters) exceeds maximum allowed tokens. ` +
    `Output has been saved to ${tmpPath}.\n` +
    `Format: ${format}\n` +
    `Use offset and limit parameters to read specific portions of the file, ` +
    `the GrepTool to search for specific content, and jq to make structured queries.\n` +
    `REQUIREMENTS FOR SUMMARIZATION/ANALYSIS/REVIEW:\n` +
    `- You MUST read the content from the file at ${tmpPath} in sequential chunks ` +
    `until 100% of the content has been read.`
  );
}
```

### Content array truncation by token budget

```javascript
async function truncateContentByTokens(contentBlocks, maxTokens) {
  const result = [];
  let consumed = 0;

  for (const block of contentBlocks) {
    if (block.type === 'text') {
      const remaining = maxTokens - consumed;
      if (remaining <= 0) break;
      if (block.text.length <= remaining) {
        result.push(block);
        consumed += block.text.length;
      } else {
        result.push({ type: 'text', text: block.text.slice(0, remaining) });
        break;
      }
    } else if (block.type === 'image') {
      result.push(block);
      consumed += 1600; // fixed token estimate per image
    }
  }

  return result;
}
```
