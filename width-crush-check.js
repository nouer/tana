const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/snap/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  for (const vp of [{w:768,h:1024,name:'tablet'},{w:1280,h:800,name:'pc'}]) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.goto('http://localhost:8088/', { waitUntil: 'networkidle0' });

    // Load sample data
    const btn = await page.$('#load-sample-btn');
    if (btn) { await btn.click(); await page.waitForTimeout(2000); }

    console.log(`\n=== ${vp.name} (${vp.w}x${vp.h}) ===`);

    // 1. Products toolbar
    await page.evaluate(() => document.querySelector('[data-tab="products"]').click());
    await page.waitForTimeout(500);

    const toolbar = await page.evaluate(() => {
      const container = document.querySelector('.toolbar');
      if (!container) return null;
      const cs = window.getComputedStyle(container);
      const children = Array.from(container.children).map(el => {
        const r = el.getBoundingClientRect();
        const ecs = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          id: el.id,
          class: el.className,
          rectWidth: Math.round(r.width),
          rectHeight: Math.round(r.height),
          flex: ecs.flex,
          minWidth: ecs.minWidth,
          width: ecs.width
        };
      });
      return {
        flexWrap: cs.flexWrap,
        width: Math.round(container.getBoundingClientRect().width),
        children
      };
    });
    console.log('\n[Products .toolbar]');
    if (toolbar) {
      console.log(`  flex-wrap: ${toolbar.flexWrap}, width: ${toolbar.width}px`);
      toolbar.children.forEach(c => {
        const warn = c.rectWidth < 60 ? ' ⚠️ CRUSHED' : '';
        console.log(`  ${c.id || c.class}: ${c.rectWidth}x${c.rectHeight}px, flex: ${c.flex}, min-width: ${c.minWidth}, width: ${c.width}${warn}`);
      });
    }

    // 2. Transactions filter-bar
    await page.evaluate(() => document.querySelector('[data-tab="transactions"]').click());
    await page.waitForTimeout(500);

    const filterBars = await page.evaluate(() => {
      const bars = document.querySelectorAll('.filter-bar');
      return Array.from(bars).map(bar => {
        const cs = window.getComputedStyle(bar);
        const visible = bar.offsetParent !== null;
        const children = Array.from(bar.children).map(el => {
          const r = el.getBoundingClientRect();
          const ecs = window.getComputedStyle(el);
          // Also check inner input/select
          const inner = el.querySelector('input, select');
          let innerInfo = null;
          if (inner) {
            const ir = inner.getBoundingClientRect();
            innerInfo = {
              tag: inner.tagName,
              rectWidth: Math.round(ir.width),
              width: window.getComputedStyle(inner).width
            };
          }
          return {
            class: el.className,
            rectWidth: Math.round(r.width),
            flex: ecs.flex,
            inner: innerInfo
          };
        });
        return {
          visible,
          flexWrap: cs.flexWrap,
          width: Math.round(bar.getBoundingClientRect().width),
          parentId: bar.parentElement?.id || bar.parentElement?.className,
          children
        };
      });
    });
    console.log('\n[Transactions .filter-bar]');
    filterBars.forEach((fb, i) => {
      if (!fb.visible) { console.log(`  filter-bar[${i}]: hidden`); return; }
      console.log(`  filter-bar[${i}]: flex-wrap: ${fb.flexWrap}, width: ${fb.width}px, parent: ${fb.parentId}`);
      fb.children.forEach(c => {
        const warn = c.rectWidth < 60 ? ' ⚠️ CRUSHED' : '';
        const innerWarn = c.inner && c.inner.rectWidth < 60 ? ' ⚠️ INNER CRUSHED' : '';
        console.log(`    ${c.class}: ${c.rectWidth}px, flex: ${c.flex}${warn}${c.inner ? ` → inner ${c.inner.tag}: ${c.inner.rectWidth}px (${c.inner.width})${innerWarn}` : ''}`);
      });
    });

    // 3. Reports filter-bar
    await page.evaluate(() => document.querySelector('[data-tab="reports"]').click());
    await page.waitForTimeout(500);

    const reportFilters = await page.evaluate(() => {
      const bars = document.querySelectorAll('.filter-bar');
      return Array.from(bars).map(bar => {
        const cs = window.getComputedStyle(bar);
        const visible = bar.offsetParent !== null;
        const children = Array.from(bar.children).map(el => {
          const r = el.getBoundingClientRect();
          const ecs = window.getComputedStyle(el);
          const inner = el.querySelector('input, select');
          let innerInfo = null;
          if (inner) {
            const ir = inner.getBoundingClientRect();
            innerInfo = {
              tag: inner.tagName,
              id: inner.id,
              rectWidth: Math.round(ir.width),
              width: window.getComputedStyle(inner).width
            };
          }
          return {
            class: el.className,
            rectWidth: Math.round(r.width),
            flex: ecs.flex,
            inner: innerInfo
          };
        });
        return {
          visible,
          flexWrap: cs.flexWrap,
          width: Math.round(bar.getBoundingClientRect().width),
          parentId: bar.parentElement?.id || bar.parentElement?.className,
          childCount: children.length,
          children
        };
      });
    });
    console.log('\n[Reports .filter-bar]');
    reportFilters.forEach((fb, i) => {
      if (!fb.visible) { console.log(`  filter-bar[${i}]: hidden`); return; }
      console.log(`  filter-bar[${i}]: flex-wrap: ${fb.flexWrap}, width: ${fb.width}px, parent: ${fb.parentId}, children: ${fb.childCount}`);
      fb.children.forEach(c => {
        const warn = c.rectWidth < 60 ? ' ⚠️ CRUSHED' : '';
        const innerWarn = c.inner && c.inner.rectWidth < 60 ? ' ⚠️ INNER CRUSHED' : '';
        console.log(`    ${c.class}: ${c.rectWidth}px, flex: ${c.flex}${warn}${c.inner ? ` → inner ${c.inner.tag}#${c.inner.id}: ${c.inner.rectWidth}px (${c.inner.width})${innerWarn}` : ''}`);
      });
    });

    // 4. Check overlay-actions buttons
    // Open product form overlay
    await page.evaluate(() => document.querySelector('[data-tab="products"]').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btn = document.querySelector('#add-product-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    const overlayActions = await page.evaluate(() => {
      const containers = document.querySelectorAll('.overlay-actions');
      return Array.from(containers).map(c => {
        const visible = c.offsetParent !== null;
        if (!visible) return { visible: false };
        const cs = window.getComputedStyle(c);
        const children = Array.from(c.children).map(el => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            text: el.textContent.trim().substring(0, 20),
            rectWidth: Math.round(r.width),
            rectHeight: Math.round(r.height)
          };
        });
        return { visible, width: Math.round(c.getBoundingClientRect().width), children };
      }).filter(c => c.visible);
    });
    console.log('\n[Overlay .overlay-actions]');
    overlayActions.forEach((oa, i) => {
      console.log(`  overlay-actions[${i}]: width: ${oa.width}px`);
      oa.children.forEach(c => {
        const warn = c.rectWidth < 60 ? ' ⚠️ CRUSHED' : '';
        console.log(`    ${c.text}: ${c.rectWidth}x${c.rectHeight}px${warn}`);
      });
    });

    await page.close();
  }
  await browser.close();
})();
