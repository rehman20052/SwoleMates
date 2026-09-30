# Social video uploads on Supabase Free

The post-media bucket stays at 50 MiB (52,428,800 bytes). The Social composer now prepares oversized videos locally before upload. It preserves the full duration and audio, caps the longest dimension at 1280 pixels, and budgets bitrate against a 40 MiB target with audio/encoder headroom. The final size is checked again before upload. Clips already within the limit are left unchanged. Photos retain the existing limit.

## Mobile build requirement

`react-native-compressor` and its `react-native-nitro-modules` runtime must be compiled into the iOS/Android app. Restarting Metro or installing an OTA JavaScript update is insufficient. Expo Go can still post smaller attachments, but cannot compress oversized videos.

After `npm install`, build locally with `npx expo run:ios` (requires full Xcode) or `npx expo run:android` (requires Android SDK), or build through your existing EAS workflow. Native project generation is handled by those Expo commands. No Supabase SQL or plan upgrade is required.

## Browser support

Web uses Mediabunny with the browser's video/audio codecs to produce H.264/AAC MP4. Unsupported input or encoder combinations show an error rather than silently removing audio or video. Use a current browser with WebCodecs support. Browser compression requires HTTPS or localhost. Keep the page open during preparation.

## Verification

- `npm run typecheck`
- `node --experimental-strip-types --test tests/media-limits.test.mjs` (Node 22.18+)
- `npx expo export --platform all`
- On rebuilt iOS and Android apps and a supported browser: select a >50 MiB 72-second video; verify progress, full-length preview and audio, then post. Verify failed compression retains the previous attachment, cancellation of the picker leaves it unchanged, and removing/replacing an attachment works.
- Test a small video, oversized photo, unsupported video, and leaving the composer during preparation.

Automated bundling cannot validate native encoders. Real-device compression and authenticated Supabase upload still need testing before release.
