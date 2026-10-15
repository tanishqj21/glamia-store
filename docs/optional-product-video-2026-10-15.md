# Optional product videos — 15 October 2026

Add Listing and Edit Listing share an optional video editor on Glamia and WiBrawl. It supports uploading, previewing, replacing, removing and cancelling a clip. Product images remain required under the existing rules; video is never required. Storage implementation wording was removed from Image Manager.

The editor lazily loads Mediabunny 1.61.4 only when a video is selected. It transcodes the primary video and audio tracks, preserves aspect ratio, bakes rotation into frames, caps the long edge at 1920 px and frame rate at 30 fps, strips source metadata, and budgets for a 35 MB output including sound/container overhead. Smaller source clips receive a smaller budget. Oversized outputs retry at a lower bitrate; only an output at most 40,000,000 bytes is uploaded. Input clips may be up to 500 MB and five minutes. MP4 AVC/AAC is preferred; supported browsers can fall back to WebM VP9/VP8 with Opus. Unsupported browser/codec failures are explicit and leave the previous clip intact. No external video URL input bypasses preparation.

The Worker authenticates uploads, checks content type and container signatures, bounds streamed request bodies to 40 MB before writing, retains non-owner upload quotas, and restricts delegated employees to product/add-product capabilities. Stored URLs must point to an existing product-video object owned by the uploader, with owner access across uploads. Video stays specific to a colourway. The additive migration 0114_product_video.sql defaults existing listings to no video. Saved product URLs participate in the existing orphan-media cleanup reference scan and seven-day grace period.

The product gallery exposes a Video thumbnail only for products with a clip. Playback requires user interaction, uses native controls, supports byte-range seeking, and does not download video on initial page load. Video is served separately from the image cache and optimizer. Compression is not part of the public initial script graph. Existing products and native clients may omit video_url without clearing an existing clip. Product form preorder values are sent directly as IST wall-clock inputs, avoiding device-zone conversion during a media edit.

Validation:

- 71 Worker/catalogue/permissions/IST/performance regression tests passed, including eight new video tests with actual migrations and in-memory storage.
- Six targeted website security tests passed.
- 34 checkout regressions passed against an isolated local Worker without payment credentials.
- Chromium encoded real moving footage with sound, verified playable MP4 dimensions/duration, compressed an input larger than 40 MB, and verified cancellation.
- Browser tests exercised Add, Edit, failed replacement preserving the old video, Remove and public playback/seek on Glamia desktop and WiBrawl mobile. Four local uploads, six local saves, zero page errors, no horizontal overflow, and no initial product video requests.
- Focused ESLint, production Vite build and complete asset-graph verification passed.

Broader security tests that depend on uncommitted native-app modules cannot run from the clean Git worktree. Those native changes were outside this feature and were preserved in the main workspace. No native app binaries were released by this change. The initial checkout-test invocation lacked its required local Worker; all 34 cases passed after starting the isolated fixture server. No production orders, payments or sample listings were created by validation.

Mediabunny's unmodified source location and MPL-2.0 notice are published at /licenses/mediabunny.txt. Existing toolchain audit findings were not introduced or changed by this dependency addition.
