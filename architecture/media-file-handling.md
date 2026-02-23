# Media File Handling in Claude Code

## Supported Formats

**Images:** PNG, JPEG, GIF, WebP (detected via file extension regex `/\.(png|jpe?g|gif|webp)$/i`)

**Format detection** uses magic byte signatures from file headers — not just extensions:
- PNG: `89 50 4E 47`
- JPEG: `FF D8 FF`
- GIF: `47 49 46`
- WebP: `52 49 46 46 ... 57 45 42 50`
- Default fallback: `image/png`

```javascript
function BA1(A) {
  if (A.length < 4) return "image/png";
  if (A[0] === 137 && A[1] === 80 && A[2] === 78 && A[3] === 71) return "image/png";
  if (A[0] === 255 && A[1] === 216 && A[2] === 255) return "image/jpeg";
  if (A[0] === 71 && A[1] === 73 && A[2] === 70) return "image/gif";
  if (A[0] === 82 && A[1] === 73 && A[2] === 70 && A[3] === 70) {
    if (A.length >= 12 && A[8] === 87 && A[9] === 69 && A[10] === 66 && A[11] === 80) return "image/webp";
  }
  return "image/png";
}
```

**Also supported:** PDFs (up to 32MB), Jupyter notebooks (with embedded image outputs)

---

## User-Provided Images

### Clipboard Paste

Platform-specific commands:
- **macOS**: `osascript` to detect/extract `«class PNGf»` from clipboard
- **Linux**: `xclip` or `wl-paste` for `image/(png|jpeg|jpg|gif|webp)` targets
- **Windows**: PowerShell `Get-Clipboard -Format Image`

```javascript
darwin: {
  checkImage: "osascript -e 'the clipboard as «class PNGf»'",
  saveImage: `osascript -e 'set png_data to (the clipboard as «class PNGf»)' -e 'set fp to open for access POSIX file "${B}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
  getPath: "osascript -e 'get POSIX path of (the clipboard as «class furl»)'",
  deleteFile: `rm -f "${B}"`
},
linux: {
  checkImage: "xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -E \"image/(png|jpeg|jpg|gif|webp)\" || wl-paste -l 2>/dev/null | grep -E \"image/(png|jpeg|jpg|gif|webp)\"",
  saveImage: `xclip -selection clipboard -t image/png -o > "${B}" 2>/dev/null || wl-paste --type image/png > "${B}"`,
  deleteFile: `rm -f "${B}"`
},
win32: {
  checkImage: "powershell -NoProfile -Command \"(Get-Clipboard -Format Image) -ne $null\"",
  saveImage: `powershell -NoProfile -Command "$img = Get-Clipboard -Format Image; if ($img) { $img.Save('${B}', [System.Drawing.Imaging.ImageFormat]::Png) }"`,
  deleteFile: `del /f "${B}"`
}
```

### File Path References

Users can reference images by path; the Read tool detects it's an image and returns it visually.

All images are converted to base64 content blocks:

```javascript
{
  type: "image",
  source: {
    type: "base64",
    data: "<base64 string>",
    media_type: "image/png"
  }
}
```

---

## Read Tool Image Handling

When the Read tool encounters an image file, it returns a structured result:

```javascript
{
  type: "image",
  file: {
    base64: "<data>",
    type: "image/png",
    originalSize: 123456,
    dimensions: {
      originalWidth, originalHeight,
      displayWidth, displayHeight
    }
  }
}
```

This gets mapped to an API tool_result content block:

```javascript
{
  tool_use_id: "...",
  type: "tool_result",
  content: [{
    type: "image",
    source: { type: "base64", data: "...", media_type: "image/png" }
  }]
}
```

---

## Size Limits & Image Optimization

**Hard limits:**
- Max size: **~3.75 MB** (`3,932,160` bytes)
- Max dimensions: **2000x2000** pixels

**Progressive optimization pipeline** (if image exceeds limits):
1. **Resize** to fit within 2000x2000 (aspect-ratio preserved)
2. **Strategy 1**: Try 4 scale factors (1.0, 0.75, 0.5, 0.25) with format-specific encoding
3. **Strategy 2**: PNG palette reduction — 800x800, 64 colors, compression level 9
4. **Strategy 3**: JPEG quality reduction at 600x600
5. **Strategy 4**: Last resort — 400x400 JPEG at quality 20

Uses **Sharp** library for all image processing.

```javascript
async function fYA(A, Q, B) {
  let Z = (await Ni1())(A);  // Sharp
  let Y = await Z.metadata();
  // ...
  if (Q <= KLA && K <= seA && V <= teA) {
    return { buffer: A, mediaType: X, dimensions: {...} };
  }
  let H = await Z.resize(K, V, { fit: "inside", withoutEnlargement: true }).toBuffer();
  if (H.length > KLA) {
    return { buffer: await Z.jpeg({ quality: 80 }).toBuffer(), mediaType: "jpeg", dimensions: {...} };
  }
  return { buffer: H, mediaType: X, dimensions: {...} };
}
```

**Coordinate mapping** — when images are resized, Claude Code tracks original vs display dimensions:

```
[Image: original 4000x3000, displayed at 2000x1500. Multiply coordinates by 2.00 to map to original image.]
```

---

## Subagent/Task Tool Results with Images

When a subagent returns a tool result containing images, the system checks for image content blocks and **passes them through** as structured content:

```javascript
if (Array.isArray(result.content) && result.content.some(block => block.type === "image")) {
  return { content: result.content, isMeta: true };  // preserve image blocks
}
```

If no images, results are serialized to JSON text instead.

---

## Jupyter Notebook Images

Notebook cell outputs containing `image/png` or `image/jpeg` MIME data are extracted and converted to base64 content blocks:

```javascript
function a63(A) {
  if (typeof A["image/png"] === "string") {
    return { image_data: A["image/png"].replace(/\s/g, ""), media_type: "image/png" };
  }
  if (typeof A["image/jpeg"] === "string") {
    return { image_data: A["image/jpeg"].replace(/\s/g, ""), media_type: "image/jpeg" };
  }
  return;
}
```

---

## PDF Handling

- Max file size: **32 MB**
- Processed page by page, extracting both text and visual content
- The Read tool supports a `pages` parameter (e.g., `"1-5"`) for large PDFs
- Returned as a separate content type, not as image blocks

---

## Transport Mechanism

**Core principle: all images travel as base64-encoded strings inside JSON messages. There are no shared file paths between components.**

### Clipboard Paste: Temp File is Just a Staging Step

```
Clipboard → temp file → Buffer → base64 → inline JSON → delete temp file
```

The temp file (`/tmp/claude_cli_latest_screenshot.png`) exists only momentarily:

```javascript
// 1. Save clipboard to disk (only way to extract from OS clipboard)
execSync(commands.saveImage);
// 2. Read into memory as Buffer
let buffer = fs.readFileBytesSync(screenshotPath);
// 3. Process (resize if needed via Sharp)
let processed = await fYA(buffer, buffer.length, "png");
// 4. Convert to base64
let base64 = processed.buffer.toString("base64");
// 5. DELETE the temp file immediately
execSync(commands.deleteFile);
// 6. Return inline
return { base64, mediaType, dimensions };
```

The temp file is a workaround because there's no direct API to get clipboard image data as a buffer in Node.js — it needs an OS-level command to write it somewhere first.

### Read Tool: Direct Buffer → Base64 Inline

No temp file involved. The file is read into a Buffer, processed through Sharp (resized/compressed if needed), then returned as base64 inline in the tool result JSON.

### Subagent Communication: stdout JSON (No Files)

Subagents communicate with the parent process via **stdout as JSON** — no IPC, no shared files. Large base64 strings are written in 2000-character chunks:

```javascript
function h9(A) {
  for (let Q = 0; Q < A.length; Q += 2000) {
    process.stdout.write(A.substring(Q, Q + 2000));
  }
}
```

When a subagent tool result contains image blocks, they're passed through as-is (base64 inline) to the parent.

### Bash Tool (curl, etc.): Text Only

The Bash tool captures stdout as text. If you run `curl` to fetch an image, you get raw binary garbage in the text output — it does NOT automatically detect or convert binary to base64.

To work with a downloaded image, Claude Code would need to:
1. `curl -o /tmp/image.png <url>` (save to file)
2. Use the Read tool on `/tmp/image.png` (which handles base64 conversion)

### WebFetch: Text Only, No Images

WebFetch converts HTML to markdown and processes it through a small model. It does not handle or return image data — only text summaries.

### Transport Summary

| Scenario | Mechanism |
|----------|-----------|
| Clipboard paste | Temp file → read → base64 → delete temp file |
| Read tool on image file | Buffer → base64 inline in JSON |
| Subagent → parent | stdout JSON with base64 inline |
| Bash (curl) | Text stdout only; must save to file + Read tool |
| WebFetch | Text/markdown only, no images |
| API transmission | Always `{type:"image", source:{type:"base64", data:...}}` |

**Bottom line:** Images never travel as file paths between components. The only temp file is the clipboard screenshot, which is deleted immediately after being read into memory. Everything else is base64 inline in JSON over stdout.
