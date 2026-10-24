"""Writes promo/captions.ass (burned in) and promo/out/ssoc-promo.srt (for upload). "|" = line break."""
CAPS = [
    (0.25, 3.95, "Job postings on MyCareersFuture carry an SSOC occupation code."),
    (4.05, 7.95, "SSOC 2024 has 1,006 occupations, five levels deep."),
    (8.05, 11.95, "It’s easy to pick the wrong one. SSOC files a Chef de Partie|under 51202 Senior cook, not 34341 Chef."),
    (12.05, 15.45, "SSOC Decision Trail lets AI pick the code, and shows its working."),
    (15.55, 20.95, "Paste a job description or a MyCareersFuture link, then press Classify."),
    (21.05, 25.90, "AI walks the tree level by level:|major → sub-major → minor → unit → occupation."),
    (26.00, 30.45, "Every option it weighs is on screen. Runners-up stay in the race."),
    (30.55, 33.95, "The finalists face off. Winner: 51202 Senior cook, 97%."),
    (34.05, 37.80, "Try it free at ssoc.danielquek.com"),
]


def ass_t(s):
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def srt_t(s):
    ms = round(s * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Segoe UI Semibold,50,&H00FFFFFF,&H00FFFFFF,&H1048342B,&H1048342B,0,0,0,0,100,100,0,0,3,16,0,2,120,120,44,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

with open("captions.ass", "w", encoding="utf-8-sig") as f:
    f.write(ASS_HEAD)
    for a, b, t in CAPS:
        f.write(f"Dialogue: 0,{ass_t(a)},{ass_t(b)},Cap,,0,0,0,,{{\\fad(120,120)}}{t.replace('|', chr(92) + 'N')}\n")

with open("out/ssoc-promo.srt", "w", encoding="utf-8") as f:
    for i, (a, b, t) in enumerate(CAPS, 1):
        f.write(f"{i}\n{srt_t(a)} --> {srt_t(b)}\n{t.replace('|', chr(10))}\n\n")
print(f"{len(CAPS)} captions")
