# SkFlip HLS Video Upload

This update adds:
- /api/video/upload-url
- Direct large video upload workflow using Cloudflare Stream
- Store returned HLS playback URL in movie hlsUrl field

Vercel environment variables:
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_STREAM_TOKEN

After upload save:
hlsUrl: the Cloudflare Stream HLS URL
