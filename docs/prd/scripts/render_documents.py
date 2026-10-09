#!/usr/bin/env python3
"""Render the combined PRD and the retired-document notice."""
from pathlib import Path
import asyncio
import json
import re
import subprocess
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = [
    ('Sona-PRD', 'SONA · PRD v1.0 · Design baseline', 'document-checks.json', 3),
    ('interaction-design', 'SONA · Document replaced by PRD v1.0', 'interaction-design-checks.json', 0),
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for stem, footer, report_name, expected_images in DOCUMENTS:
            subprocess.run([
                'pandoc', stem + '.md', '--from=markdown-implicit_figures', '--to=html5',
                '--standalone', '--toc', '--toc-depth=2', '--embed-resources',
                '--css=document.css', '--output=' + stem + '.html',
            ], cwd=ROOT, check=True)
            html_path = ROOT / (stem + '.html')
            markup = html_path.read_text()
            markup, figures = re.subn(
                r'<p>(<img\b[^>]*>)</p>\s*<p><em>(Figure.*?)</em></p>',
                r'<figure class="concept-figure">\1<figcaption>\2</figcaption></figure>',
                markup, flags=re.S,
            )
            html_path.write_text(markup)
            page = await browser.new_page(viewport={'width':1440,'height':1100})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            await page.set_content(markup, wait_until='load')
            await page.evaluate('document.fonts.ready')
            report = await page.evaluate('''() => ({
                title:document.title,
                images:Array.from(document.images).map(i=>({loaded:i.complete&&i.naturalWidth>0,embedded:i.src.startsWith('data:')})),
                figureCount:document.querySelectorAll('figure.concept-figure').length,
                tables:document.querySelectorAll('table').length,
                missingAnchors:Array.from(document.querySelectorAll('a[href^="#"]')).filter(a=>!document.getElementById(decodeURIComponent(a.hash.slice(1)))).map(a=>a.hash),
                horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth,
                externalAssets:Array.from(document.querySelectorAll('script[src],link[rel="stylesheet"],img')).map(e=>e.src||e.href).filter(s=>s&&/^https?:/.test(s))
            })''')
            report.update({'version':'1.0','pageErrors':errors,'status':'Document rendering only. No automated language-compliance check or application test.'})
            assert len(report['images']) == expected_images
            assert figures == expected_images
            assert all(i['loaded'] and i['embedded'] for i in report['images'])
            assert not report['missingAnchors'] and not report['horizontalOverflow'] and not errors
            await page.pdf(path=str(ROOT/(stem+'.pdf')), format='A4', print_background=True,
                prefer_css_page_size=True, display_header_footer=True, header_template='<div></div>',
                footer_template='<div style="width:100%;margin:0 15mm;font:8px Arial;color:#64736c;display:flex;justify-content:space-between"><span>'+footer+'</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
            await page.screenshot(path='/tmp/'+stem+'-v10-cover.png')
            (ROOT/report_name).write_text(json.dumps(report,indent=2)+'\n')
            print(stem, json.dumps(report))
            await page.close()
        await browser.close()

asyncio.run(main())
