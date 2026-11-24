import random,subprocess,json,re,os,lilypond
LP=lilypond.executable()
N=["C4","D4","E4","F4","G4","A4","B4","C5"]
LYN={"C4":"c'","D4":"d'","E4":"e'","F4":"f'","G4":"g'","A4":"a'","B4":"b'","C5":"c''"}
DUR={1:"4",.5:"8",2:"2"}
RITM={4:[[1,1,1,1]],3:[[1,1,2],[2,1,1],[1,2,1]],5:[[1,.5,.5,1,1],[.5,.5,1,1,1],[1,1,.5,.5,1],[1,1,1,.5,.5]],6:[[.5,.5,.5,.5,1,1],[1,.5,.5,.5,.5,1],[.5,.5,1,.5,.5,1]]}
R=random.Random(7)
def melody(n):
    i=R.randint(1,5);o=[]
    for _ in range(n):
        o.append(N[i]); i=max(0,min(7,i+R.choice([-2,-1,1,2,1,-1,0])))
    return o
def tweak(p):
    q=p[:];j=R.randrange(len(q));i=N.index(q[j]);d=R.choice([-2,-1,1,2])
    if not 0<=i+d<=7: d=-d
    q[j]=N[i+d];return q
key=lambda s:"|".join(f"{a}:{b}" for a,b in s)
def gen(k):
    if k==1:
        ok=[[x,1] for x in melody(4)];w=[]
        while len(w)<2:
            c=[[x,1] for x in melody(4)]
            if key(c) not in [key(s) for s in [ok]+w] and any(abs(N.index(c[i][0])-N.index(ok[i][0]))>=2 for i in range(4)): w.append(c)
    elif k==2:
        p=melody(4);ok=[[x,1] for x in p];w=[]
        while len(w)<2:
            c=[[x,1] for x in tweak(p)]
            if key(c) not in [key(s) for s in [ok]+w]: w.append(c)
    elif k==3:
        n=R.choice([3,5,6]);rs=RITM[n][:];R.shuffle(rs);p=melody(n);ok=[[x,rs[0][i]] for i,x in enumerate(p)]
        w=[[[x,r[i]] for i,x in enumerate(p)] for r in rs[1:3]]
    else:
        while True:
            r1=R.choice(RITM[4]+RITM[5]+RITM[3]);r2=R.choice(RITM[5]+RITM[6]+RITM[3]);r=r1+r2;p=melody(len(r))
            ok=[[x,r[i]] for i,x in enumerate(p)]
            c1=[[x,r[i]] for i,x in enumerate(tweak(p))]
            alts=[z for z in RITM[len(r2)] if z!=r2]
            if not alts: continue
            c2=[[x,(r1+R.choice(alts))[i]] for i,x in enumerate(p)];w=[c1,c2];break
    assert len({key(s) for s in [ok]+w})==3
    return ok,w
def ly(seq):
    out=[];beat=0
    for n,d in seq:
        out.append(LYN[n]+DUR[d]);beat+=d
        if beat==4 and len(seq)>len(out): out.append("|")
    meas=2 if sum(d for _,d in seq)>4 else 1
    return " ".join(out),meas
def render(seq,i):
    body,meas=ly(seq)
    src=f'''\\version "2.24.0"
\\header {{ tagline = ##f }}
\\paper {{ indent = 0 ragged-right = ##f line-width = {62 if meas==1 else 100}\\mm }}
\\layout {{ \\context {{ \\Score \\remove "Bar_number_engraver" }} }}
{{ \\clef treble \\numericTimeSignature \\time 4/4 {body} \\bar "|." }}'''
    open(f"r{i}.ly","w").write(src)
    subprocess.run([LP,"-dbackend=svg","-dcrop","-dno-point-and-click","-l","ERROR","-o",f"r{i}",f"r{i}.ly"],check=True,capture_output=True)
    s=open(f"r{i}.cropped.svg").read()
    s=re.sub(r'\swidth="[^"]+mm" height="[^"]+mm"','',s,1)
    s=re.sub(r'<style.*?</style>\s*','',s,flags=re.S)
    s=re.sub(r'\n\s*','',s)
    s=re.sub(r'(\d+\.\d{3})\d+',r'\1',s)
    return s
bank={};i=0
for k in [1,2,3,4]:
    bank[k]=[]
    for _ in range(40):
        ok,w=gen(k); bank[k].append({"ok":ok,"w":w,"svg":render(ok,i)}); i+=1
json.dump(bank,open("bank.json","w"))
print(sum(len(r["svg"]) for v in bank.values() for r in v))
