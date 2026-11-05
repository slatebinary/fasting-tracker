"""Runtime tests for strict page-side release metadata validation."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "js" / "release-health.js"

def test_release_health_rejects_incomplete_or_malformed_integrity_metadata():
    script = r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const window={addEventListener(){}};const document={readyState:'loading'};
vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{window,document});
const validate=window.FTReleaseHealth.validateMetadata;
const good={protocolVersion:1,version:'1.17.23',entry:'./index.html',shell:['./index.html','./app.js'],integrityAlgorithm:'SHA-256',htmlNormalization:'github-pages-v1',hashes:{'./index.html':'a'.repeat(64),'./app.js':'b'.repeat(64)}};
assert.equal(validate(good,1).version,'1.17.23');
for(const mutate of [
 x=>delete x.hashes['./app.js'],
 x=>x.hashes['./app.js']='not-a-digest',
 x=>x.hashes['./extra.js']='c'.repeat(64),
 x=>x.shell.push('./app.js'),
 x=>x.shell.pop(),
 x=>x.shell=[],
 x=>x.integrityAlgorithm='MD5',
 x=>x.htmlNormalization='unknown',
 x=>x.version='1.17',
 x=>x.entry='./missing.html'
]){
 const broken=JSON.parse(JSON.stringify(good));mutate(broken);
 assert.throws(()=>validate(broken,1));
}
assert.throws(()=>validate(good,2));
"""
    result = subprocess.run(
        ["node", "-e", script, str(SOURCE)],
        cwd=ROOT, text=True, capture_output=True, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
