#!/usr/bin/env python3
"""Regression: kg/lb controls and suffixes must remain horizontal on narrow screens."""
import sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}"); sys.exit(0)
data=build_data(1)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":320,"height":844},timezone_id="Europe/Sofia")
    errors=[];page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDbV2(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.13.9'})); }",data)
    page.set_content(inlined_html(),wait_until="domcontentloaded");page.wait_for_timeout(150)
    page.locator('.tab[data-screen="weight"]').click()
    # The setup/onboarding unit buttons use the same no-wrap protection.
    setup=page.evaluate("""() => {const modal=document.querySelector('#setupModal'),step=document.querySelector('#setupStepBasics');modal.hidden=false;modal.style.display='flex';step.hidden=false;const toggle=document.querySelector('.setupUnitToggle'),kg=document.querySelector('#setupUnitKgBtn'),lb=document.querySelector('#setupUnitLbBtn');const rect=e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height};};return {toggle:rect(toggle),kg:rect(kg),lb:rect(lb),toggleWS:getComputedStyle(toggle).whiteSpace,kgWS:getComputedStyle(kg).whiteSpace,lbWS:getComputedStyle(lb).whiteSpace};}""")
    if setup["kg"]["width"]<64 or setup["lb"]["width"]<64 or any(setup[k]!="nowrap" for k in ["toggleWS","kgWS","lbWS"]):
        print("FAIL: onboarding kg/lb buttons are squeezed",setup);sys.exit(1)
    page.locator('#setupModal').evaluate("(el)=>{el.hidden=true;el.style.display='';}")
    for width in (320,360,390):
        page.set_viewport_size({"width":width,"height":844});page.wait_for_timeout(50)
        m=page.evaluate("""() => {const kg=document.querySelector('#unitKgBtn'),lb=document.querySelector('#unitLbBtn'),input=document.querySelector('#weightTargetInput'),unit=document.querySelector('#weightTargetUnit');const r=e=>{const x=e.getBoundingClientRect();return {left:x.left,right:x.right,width:x.width};};return {kg:r(kg),lb:r(lb),input:r(input),unit:r(unit),unitWS:getComputedStyle(unit).whiteSpace,kgWS:getComputedStyle(kg).whiteSpace,lbWS:getComputedStyle(lb).whiteSpace};}""")
        if m["kg"]["width"]<35 or m["lb"]["width"]<35 or m["unit"]["width"]<12 or any(m[k]!="nowrap" for k in ["unitWS","kgWS","lbWS"]) or m["unit"]["left"]<m["input"]["right"]-1:
            print("FAIL: unit labels or suffix squeezed/overlapping",width,m);sys.exit(1)
    page.locator("#addWeightBtn").click();page.wait_for_timeout(50)
    m=page.evaluate("""() => {const i=document.querySelector('#weightValueInput'),u=document.querySelector('#weightModalUnit');return {iw:i.getBoundingClientRect().width,uw:u.getBoundingClientRect().width,ws:getComputedStyle(u).whiteSpace};}""")
    if m["iw"]<=0 or m["uw"]<12 or m["ws"]!="nowrap":print("FAIL: modal unit not readable",m);sys.exit(1)
    if errors:print("FAIL: browser errors: "+" | ".join(errors[:3]));sys.exit(1)
    browser.close()
print("PASS: kg/lb controls and weight suffixes remain readable at 320–390 px")
