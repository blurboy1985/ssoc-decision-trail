#!/usr/bin/env bash
# Assembles promo/out/ssoc-promo.mp4 from captured frames, captions and the synthesised BGM.
# Run after capture-app.mjs and capture-cards.mjs.
set -euo pipefail
cd "$(dirname "$0")"
F=frames; S=out/seg; mkdir -p "$S" out/fonts
cp /c/Windows/Fonts/seguisb.ttf out/fonts/  # Segoe UI Semibold for the captions
ENC="-c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -r 30"

card() { ffmpeg -v error -y -framerate 30 -i "$F/$1/%05d.jpg" $ENC "$S/$2.mp4"; }
# app clip: name, start frame, source frames, output frames, crop w:h:x:y (frame px, DSF 1.5)
clip() {
  ffmpeg -v error -y -framerate 30 -start_number "$2" -i "$F/app/%05d.jpg" \
    -vf "trim=end_frame=$3,crop=$5,scale=1920:1080:flags=lanczos,setpts=PTS*$4/$3,fps=30" -frames:v "$4" $ENC "$S/$1.mp4"
}
INPUT=2160:1215:0:214     # job description panel + Classify
CANVAS=2272:1278:607:207  # decision canvas

card hook 1; card scale 2; card confuse 3; card solution 4
clip 5 22 190 165 "$INPUT"
clip 6 289 690 285 "$CANVAS"
clip 7 985 150 105 "$CANVAS"
card cta 8

printf "file 'seg/%s.mp4'\n" 1 2 3 4 5 6 7 8 > out/concat.txt
ffmpeg -v error -y -f concat -safe 0 -i out/concat.txt -c copy out/video_nocap.mp4

python captions.py
python bgm.py out/bgm.wav 38
ffmpeg -v error -y -i out/video_nocap.mp4 -i out/bgm.wav \
  -vf "subtitles=captions.ass:fontsdir=out/fonts" \
  -af "volume=-1.5dB,alimiter=limit=-2dB:level=false" -ar 48000 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -r 30 \
  -c:a aac -b:a 192k -movflags +faststart -shortest out/ssoc-promo.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames out/ssoc-promo.mp4
