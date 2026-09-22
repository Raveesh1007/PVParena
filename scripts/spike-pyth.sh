#!/usr/bin/env bash
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd /mnt/e/stocklana/pvpstats || exit 1
python3 - <<PY
import re,glob,os
def ver(s):
    p=[int(x) for x in re.findall(r"\d+",s)[:3]]
    return tuple(p+[0]*(3-len(p)))
LIMIT=(1,84,1)
lock=open("Cargo.lock").read()
pkgs=re.findall(r'\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"',lock)
roots=glob.glob(os.path.expanduser("~/.cargo/registry/src/*"))
bad=[]
for n,v in pkgs:
    for r in roots:
        p=os.path.join(r,n+"-"+v,"Cargo.toml")
        if os.path.exists(p):
            t=open(p,encoding="utf-8",errors="ignore").read()
            m=re.search(r'^rust-version\s*=\s*"([^"]+)"',t,re.M)
            if m and ver(m.group(1))>LIMIT: bad.append(n+" "+v)
            elif re.search(r'^edition\s*=\s*"2024"',t,re.M): bad.append(n+" "+v)
            break
print("SCAN_BLOCKERS:", bad or "none")
PY
if anchor build > /tmp/spike_build.log 2>&1; then
  echo "PYTH_SDK_BUILD: PASS"
else
  echo "PYTH_SDK_BUILD: FAIL"
  grep -E "^error" /tmp/spike_build.log | head -12
fi
