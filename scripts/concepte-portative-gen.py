# Gravează portativele din „Conceptul săptămânii” cu LilyPond (pip install lilypond).
# Pași: 1) node -e (exportă PS_CONCEPTE_VZ → /tmp/ly/staffs.json, vezi mai jos)  2) python3 scripts/concepte-portative-gen.py
# node -e 'global.window={};require("./public/vendor/concepte-1.js");const o=[];const a=s=>{if(s.k==="staff")o.push({n:s.n||"",clef:s.clef===undefined?"g":s.clef,key:s.key||"",time:s.time||"",hlLine:s.hlLine||0,nums:!!s.nums});if(s.k==="cmp"){a(s.a);a(s.b)}};Object.values(window.PS_CONCEPTE_VZ).forEach(x=>x.forEach(a));require("fs").writeFileSync("/tmp/ly/staffs.json",JSON.stringify(o))'
import json, re, subprocess, os, lilypond, hashlib
L = lilypond.executable()
specs = json.load(open("/tmp/ly/staffs.json"))
PUR = "(rgb-color 0.42 0.18 0.79)"
ACC = {"#": "is", "b": "es", "n": "", "": ""}

def pitch(n):
    m = re.match(r"^([A-G])(#|b|n)?(\d)$", n)
    L_, a, o = m.group(1), m.group(2) or "", int(m.group(3))
    name = L_.lower() + ACC[a]
    name = {"ees": "es", "aes": "as"}.get(name, name)
    octs = "'" * (o - 3) if o > 3 else "," * (3 - o)
    midi = (o + 1) * 12 + {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[L_] + (1 if a == "#" else -1 if a == "b" else 0)
    return name + octs + ("!" if a == "n" else ""), midi

DUR = {"w": "1", "h": "2", "q": "4", "e": "8", "s": "16"}

def attrs(d):
    return "#'(" + " ".join('(%s . "%s")' % (k, v) for k, v in d.items()) + ")"

def lab_markup(t):
    t = t.replace("_", " ").replace('"', "")
    return '_\\markup \\sans \\fontsize #-4 \\with-color #%s \\bold "%s"' % (PUR, t)

def convert(sp):
    toks = sp["n"].split() if sp["n"].strip() else []
    body = []
    # pre-scan beam groups
    parsed = []
    for t in toks:
        if re.match(r"^(\||\|\||\|\]|\|:|:\|)$", t):
            parsed.append({"bar": t}); continue
        parts = t.split("!")
        b, mods = parts[0], parts[1:]
        lab = None
        if "~" in b:
            b, lab = b.split("~", 1)
        mm = []
        for x in mods:
            if "~" in x:
                x, lab = x.split("~", 1)
            mm.append(x)
        pn, dr = (b.split("/") + ["q"])[:2]
        dot = dr.endswith("."); d = dr.rstrip(".")
        parsed.append({"pn": pn, "d": d, "dot": dot, "mods": mm, "lab": lab})
    # beams: consecutive e/s notes (not rests) in groups up to 4, broken by bars, rests, tuplet bounds
    grp = []
    def flush():
        if len(grp) > 1:
            grp[0]["beam"] = "["; grp[-1]["beam"] = "]"
        grp.clear()
    for p in parsed:
        if "bar" in p or p["pn"] == "r" or p["d"] not in ("e", "s"):
            flush(); continue
        if "3(" in p["mods"]: flush()
        grp.append(p)
        if len(grp) == 4 or "3)" in p["mods"]: flush()
    flush()
    i = 0; si = 0
    DL = {"w": 16, "h": 8, "q": 4, "e": 2, "s": 1}
    segs = []; cur = 0; intup = False
    for p in parsed:
        if "bar" in p: segs.append(cur); cur = 0; continue
        if "3(" in p.get("mods", []): intup = True
        cur += DL[p["d"]] * (1.5 if p["dot"] else 1) * (2/3 if intup else 1)
        if "3)" in p.get("mods", []): intup = False
    segs.append(cur)
    segs = [round(x) for x in segs]
    meas = None
    if sp["time"]:
        a_, b_ = sp["time"].split("/"); meas = int(a_) * 16 // int(b_)
    si_seg = 0
    def seg_head(k):
        L_ = segs[k]
        if L_ <= 0: return ""
        if meas is None: return "\\time %d/16 " % L_
        if k == 0 and L_ < meas: return "\\partial 16*%d " % L_
        return ""
    body.append(seg_head(0))
    for p in parsed:
        if "bar" in p:
            body.append('\\bar "%s"' % {"|": "|", "||": "||", "|]": "|.", "|:": ".|:", ":|": ":|."}[p["bar"]])
            si_seg += 1
            if si_seg < len(segs): body.append(seg_head(si_seg))
            continue
        delay = "animation-delay:%.2fs" % (0.15 + i * 0.22); i += 1
        pre = ""
        for g in ("Stem", "Accidental", "Flag", "Dots", "Script"):
            pre += "\\once \\override %s.output-attributes = %s " % (g, attrs({"class": "ap", "style": delay}))
        hl = "h" in p["mods"]
        if hl:
            pre += "\\once \\override NoteHead.color = #%s \\once \\override Stem.color = #%s " % (PUR, PUR)
        if "3(" in p["mods"]: pre = "\\tuplet 3/2 { " + pre
        dur = DUR[p["d"]] + ("." if p["dot"] else "")
        if p["pn"] == "r":
            ev = "\\tweak output-attributes %s r%s" % (attrs({"class": "ap", "style": delay}), dur)
        else:
            heads = []
            for n in p["pn"].split("+"):
                lp, midi = pitch(n)
                heads.append("\\tweak output-attributes %s %s" % (attrs({"class": "nh seq " + ("glow" if hl else "ap"), "data-m": midi, "data-i": si, "style": "" if hl else delay}), lp))
            si += 1
            ev = ("<%s>" % " ".join(heads) if len(heads) > 1 else heads[0]) + dur
        post = ""
        if p.get("beam"): post += p["beam"]
        if "s" in p["mods"]: post += "-."
        if "a" in p["mods"]: post += "->"
        if "f" in p["mods"]: post += "\\fermata"
        if "t" in p["mods"]: post += "~"
        if "(" in p["mods"]: post += "("
        if ")" in p["mods"]: post += ")"
        if p["lab"]: post += " -\\tweak output-attributes %s %s" % (attrs({"class": "ap", "style": delay}), lab_markup(p["lab"]))
        if "3)" in p["mods"]: post += " }"
        body.append(pre + ev + post)
    head = ""
    clef = sp["clef"]
    if clef == "f": head += "\\clef bass "
    elif clef == "g": head += "\\clef treble "
    else: head += "\\omit Staff.Clef "
    if sp["key"]:
        k = sp["key"]; head += {"#1": "\\key g \\major ", "#2": "\\key d \\major ", "#3": "\\key a \\major ", "b1": "\\key f \\major ", "b2": "\\key bes \\major "}[k]
    if sp["time"]:
        a, b = sp["time"].split("/"); head += "\\numericTimeSignature \\time %s/%s " % (a, b)
    else:
        head += "\\omit Staff.TimeSignature "
    if not "".join(body).strip(): body = ["\\time 4/4 s1 s1 s1"]
    return '''\\version "2.24.0"
#(set-global-staff-size 20)
\\paper { indent=0 tagline=##f }
\\layout { \\context { \\Score \\omit BarNumber } }
{ %s \\autoBeamOff \\accidentalStyle default %s }
''' % (head, " ".join(body))

def key_of(sp):
    return "%s|%s|%s|%s" % (sp["clef"] if sp["clef"] is not None else "", sp["key"], sp["time"], sp["n"])

out = {}
os.makedirs("/tmp/ly/o", exist_ok=True)
for k, sp in enumerate(specs):
    src = convert(sp)
    h = hashlib.md5(src.encode()).hexdigest()[:8]
    fn = "/tmp/ly/o/s" + h
    open(fn + ".ly", "w").write(src)
    r = subprocess.run([L, "-dbackend=svg", "-dcrop", "-dno-point-and-click", "-o", fn, fn + ".ly"], capture_output=True, text=True)
    if not os.path.exists(fn + ".cropped.svg"):
        print("FAIL", sp["n"], r.stderr[-800:]); continue
    if "error" in r.stderr.lower(): print("WARN", sp["n"], r.stderr[-400:])
    svg = open(fn + ".cropped.svg").read()
    svg = re.sub(r'<style type="text/css">.*?</style>', "", svg, flags=re.S)
    svg = re.sub(r' width="[\d.]+mm" height="[\d.]+mm"', "", svg)
    # linii portativ: highlight + numere
    lines = [(m.start(), float(m.group(1))) for m in re.finditer(r'<g transform="translate\(0\.0000, ([\d.\-]+)\)">\s*<line[^>]*x1="0\.0500"', svg)]
    vb = re.search(r'viewBox="([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+)"', svg)
    x0, y0, w, hgt = map(float, vb.groups())
    extra = ""
    ys = sorted([y for _, y in lines], reverse=True)  # de jos în sus
    if sp["hlLine"] and len(ys) >= 5:
        y = ys[sp["hlLine"] - 1]
        extra += '<line class="glow" x1="0" x2="%.3f" y1="%.4f" y2="%.4f" stroke="#7b3fe4" stroke-width="0.35"/>' % (x0 + w, y, y)
    if sp["nums"] and len(ys) >= 5:
        for j, y in enumerate(ys[:5]):
            extra += '<text class="ap" style="animation-delay:%.2fs" x="%.3f" y="%.4f" font-size="1.1" font-weight="800" fill="#7b3fe4" font-family="system-ui,sans-serif">%d</text>' % (0.2 + j * 0.25, x0 + w + 0.5, y + 0.4, j + 1)
        w += 2.2
    # spațiu pentru animația de sus și margini
    svg = re.sub(r'viewBox="[^"]+"', 'viewBox="%.4f %.4f %.4f %.4f"' % (x0 - 0.4, y0 - 0.6, w + 0.8, hgt + 1.2), svg, count=1)
    svg = svg.replace("</svg>", extra + "</svg>")
    svg = re.sub(r"<\?xml[^>]*>\s*", "", svg)
    svg = re.sub(r"\n\s*", "\n", svg)
    svg = svg.replace('<svg ', '<svg class="ly" ', 1)
    out[key_of(sp)] = svg
total = sum(len(v) for v in out.values())
print(len(out), "portative,", total // 1024, "KB")
js = "// Portativele pentru „Conceptul săptămânii”, gravate cu LilyPond (generat automat din PS_CONCEPTE_VZ — nu edita de mână).\nwindow.PS_STAFF_SVG=" + json.dumps(out, ensure_ascii=False) + ";\n"
open("public/vendor/concepte-portative.js", "w").write(js)
