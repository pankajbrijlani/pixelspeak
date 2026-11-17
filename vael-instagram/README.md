# Vael Instagram kit

Built from the vael-site design: dark brown, cream, orange, Archivo Expanded headlines and the handwritten script accent. Ready-to-post files are in `export/`.

## Animations (MP4, H.264, 30fps, 12s = a seamless 6s loop played twice)

| File | Size | Use |
| --- | --- | --- |
| `vael-logo-square.mp4` | 1080×1080 | Feed post / intro sting |
| `vael-logo-story.mp4` | 1080×1920 | Story or Reel intro/outro |
| `vael-bookings-story.mp4` | 1080×1920 | "Bookings open" story/Reel with scrolling genre bands |
| `vael-bookings-post.mp4` | 1080×1350 | Same, as a 4:5 feed post |

The logo animation is timed to 126 BPM, so it sits on a tech house track if you add audio in Instagram.

## Static posts (PNG)

| File | Size | Note |
| --- | --- | --- |
| `post-1-statement.png` | 1080×1350 | "Read the room" brand statement |
| `post-2-book-vael.png` | 1080×1350 | Services list |
| `post-3-genres.png` | 1080×1350 | What I play |
| `post-4-dates.png` | 1080×1350 | **Template:** placeholder dates/venues |
| `post-5-new-mix.png` | 1080×1350 | **Template:** add cover photo at `vael-site/images/mix-1.jpg` |
| `profile-picture.png` | 1080×1080 | Instagram crops it to a circle |
| `highlight-*.png` | 1080×1920 | Story highlight covers: mixes, dates, book |

## Editing and re-exporting

Text lives in `posts.html`, `marquee.html` (the `GENRES` / `BAND2` lists) and `logo.html`. Open any of them in a browser to preview; the animations loop live.

```bash
cd vael-instagram
npm i playwright          # once
node render.mjs --stills  # quick key-frame check
node render.mjs           # full export (needs ffmpeg)
```
