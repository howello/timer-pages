# Homepage Hero Timeline Figma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign only the homepage hero's left and right regions in the target Figma file as an information-first “Now + Important Moments” layout.

**Architecture:** Work in place inside the existing homepage hero frame. Discover the target from the current screen's exact text anchors, build a hidden two-panel Auto Layout replacement incrementally, validate each panel, then atomically remove only the two old hero subtrees and reveal the replacement. Repository product files remain read-only references throughout this plan.

**Tech Stack:** Figma MCP `use_figma`, Figma Plugin API, Figma metadata and screenshot tools, existing HTML/CSS design tokens from `public/index.html` and `public/css/fluffy.css`.

## Global Constraints

- Modify only the homepage hero containing the exact text anchors `把重要的日子，摆在光里。` and `等待置顶`.
- Do not modify the floating header, event list, modal, password screen, design-system assets, variables, or any unrelated Figma node.
- Do not modify repository product code during this Figma-only execution.
- Preserve the existing Fluffy palette: `#F8EFDF`, `#FFF9EC`, `#2D332D`, `#74786F`, `#E87670`, `#EFC85B`, `#78B59C`, `#86B8D7`, and `#A892BB`.
- Preserve the existing 8px corner radius and soft glass/neumorphic treatment.
- The right panel is read-only and shows: pinned event first, then the nearest two future events; when no pinned item exists, it shows the nearest three future events.
- Build related content with Auto Layout, not absolute positioning inside panels.
- Every `use_figma` call includes `figma-use` in `skillNames`, uses top-level `await`, returns all created or mutated node IDs, and performs at most ten logical node operations.
- Load every font before creating or mutating text.
- On any `use_figma` error, stop, inspect the error and current metadata, correct the script, and only then retry.
- Execution requires a connected Figma file plus callable `use_figma`, `get_metadata`, and screenshot tools. If any are unavailable, stop before Task 1 and ask the user to connect the Figma integration and provide or open the target file.

---

### Task 1: Locate the Homepage Hero and Record a Read-Only Baseline

**Artifacts:**
- Read: `public/index.html:28`
- Read: `public/css/fluffy.css:1`
- Inspect only: active Figma file and its current page
- Modify: nothing

**Interfaces:**
- Produces: `HeroBaseline` with `pageId`, `parentId`, `oldLeftId`, `oldRightId`, `targetBounds`, `pageSiblingFingerprint`, `parentSiblingFingerprint`, and a baseline screenshot.
- Consumes: an active Figma file whose current page contains the homepage screen.

- [ ] **Step 1: Load the required Figma guidance and tool schemas**

Load `figma-use`, `figma-generate-design`, `plugin-api-standalone.index.md`, `gotchas.md`, and `validation-and-recovery.md`. Batch-load the schemas for `use_figma`, `get_metadata`, and `get_screenshot` in one discovery call.

Expected: all three callable tools are available and the target Figma file is identified.

- [ ] **Step 2: Run a read-only target discovery script**

```js
const page = figma.currentPage;
const exactText = (value) => page.findOne(
  (node) => node.type === 'TEXT' && node.characters === value
);

const headline = exactText('把重要的日子，摆在光里。');
const dialTitle = exactText('等待置顶');
if (!headline || !dialTitle) {
  throw new Error('Current page does not contain both homepage hero anchors');
}

function ancestors(node) {
  const result = [];
  let current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    result.push(current);
    current = current.parent;
  }
  return result;
}

const rightAncestors = new Set(ancestors(dialTitle));
const hero = ancestors(headline).find(
  (node) => rightAncestors.has(node) && 'children' in node
);
if (!hero || !('children' in hero)) {
  throw new Error('Could not resolve the shared homepage hero container');
}

const oldLeft = hero.children.find(
  (node) => 'findOne' in node && node.findOne((child) => child.id === headline.id)
);
const oldRight = hero.children.find(
  (node) => 'findOne' in node && node.findOne((child) => child.id === dialTitle.id)
);
if (!oldLeft || !oldRight || oldLeft.id === oldRight.id) {
  throw new Error('Could not resolve two distinct hero subtrees');
}

const targetBounds = {
  x: Math.min(oldLeft.x, oldRight.x),
  y: Math.min(oldLeft.y, oldRight.y),
  width: Math.max(oldLeft.x + oldLeft.width, oldRight.x + oldRight.width)
    - Math.min(oldLeft.x, oldRight.x),
  height: Math.max(oldLeft.y + oldLeft.height, oldRight.y + oldRight.height)
    - Math.min(oldLeft.y, oldRight.y)
};
const pageSiblingFingerprint = page.children
  .filter((node) => node.id !== hero.id)
  .map((node) => ({
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    visible: node.visible
  }));
const parentSiblingFingerprint = hero.children
  .filter((node) => node.id !== oldLeft.id && node.id !== oldRight.id)
  .map((node) => ({
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    visible: node.visible
  }));

return {
  currentPageId: page.id,
  currentPageName: page.name,
  parentId: hero.id,
  oldLeftId: oldLeft.id,
  oldRightId: oldRight.id,
  targetBounds,
  pageSiblingFingerprint,
  parentSiblingFingerprint
};
```

Expected: one hero container and two distinct child subtrees are returned; the script creates or mutates no nodes.

- [ ] **Step 3: Capture the baseline structure and screenshot**

Use `get_metadata` on `heroId` and `get_screenshot` on `heroId`. Save the returned structure and image in the execution context as `HeroBaseline`.

Expected: the screenshot contains the current marketing copy on the left and circular spotlight on the right.

---

### Task 2: Build a Hidden Two-Panel Auto Layout Skeleton

**Artifacts:**
- Modify: the discovered Figma hero frame only
- Modify: no repository files

**Interfaces:**
- Consumes: `HeroBaseline.parentId`, `HeroBaseline.targetBounds`.
- Produces: `HeroSkeleton` with `wrapperId`, `nowPanelId`, and `timelinePanelId`.

- [ ] **Step 1: Create the hidden replacement wrapper and its two panels**

```js
const page = figma.currentPage;
const headline = page.findOne(
  (node) => node.type === 'TEXT' && node.characters === '把重要的日子，摆在光里。'
);
const dialTitle = page.findOne(
  (node) => node.type === 'TEXT' && node.characters === '等待置顶'
);
if (!headline || !dialTitle) {
  throw new Error('Current page does not contain both homepage hero anchors');
}
function ancestors(node) {
  const result = [];
  let current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    result.push(current);
    current = current.parent;
  }
  return result;
}
const rightAncestors = new Set(ancestors(dialTitle));
const hero = ancestors(headline).find(
  (node) => rightAncestors.has(node) && 'appendChild' in node
);
if (!hero || !('appendChild' in hero)) {
  throw new Error('Hero frame is unavailable or cannot contain children');
}
const oldLeft = hero.children.find(
  (node) => node.id === headline.id || (
    'findOne' in node && node.findOne((child) => child.id === headline.id)
  )
);
const oldRight = hero.children.find(
  (node) => node.id === dialTitle.id || (
    'findOne' in node && node.findOne((child) => child.id === dialTitle.id)
  )
);
if (!oldLeft || !oldRight || oldLeft.id === oldRight.id) {
  throw new Error('Could not resolve two distinct hero subtrees');
}
if (hero.findOne((node) => node.name === 'Hero / Today Timeline')) {
  throw new Error('Replacement hero already exists; inspect before continuing');
}

const targetX = Math.min(oldLeft.x, oldRight.x);
const targetY = Math.min(oldLeft.y, oldRight.y);
const targetWidth = Math.max(oldLeft.x + oldLeft.width, oldRight.x + oldRight.width) - targetX;
const targetHeight = Math.max(oldLeft.y + oldLeft.height, oldRight.y + oldRight.height) - targetY;
const insertionIndex = Math.min(
  hero.children.indexOf(oldLeft),
  hero.children.indexOf(oldRight)
);

const wrapper = figma.createAutoLayout('HORIZONTAL', {
  name: 'Hero / Today Timeline',
  itemSpacing: 20,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0
});
hero.insertChild(insertionIndex, wrapper);
wrapper.resize(targetWidth, targetHeight);
wrapper.primaryAxisSizingMode = 'FIXED';
wrapper.counterAxisSizingMode = 'FIXED';
if (!('layoutMode' in hero) || hero.layoutMode === 'NONE') {
  wrapper.x = targetX;
  wrapper.y = targetY;
}
wrapper.visible = false;
wrapper.placeholder = true;

const nowPanel = figma.createAutoLayout('VERTICAL', {
  name: 'Hero / Now',
  paddingTop: 28,
  paddingRight: 28,
  paddingBottom: 28,
  paddingLeft: 28,
  itemSpacing: 18
});
wrapper.appendChild(nowPanel);
nowPanel.resize((targetWidth - 20) * 0.39, targetHeight);
nowPanel.primaryAxisSizingMode = 'FIXED';
nowPanel.counterAxisSizingMode = 'FIXED';
nowPanel.placeholder = true;

const timelinePanel = figma.createAutoLayout('VERTICAL', {
  name: 'Hero / Important Moments',
  paddingTop: 26,
  paddingRight: 26,
  paddingBottom: 26,
  paddingLeft: 26,
  itemSpacing: 14
});
wrapper.appendChild(timelinePanel);
timelinePanel.resize((targetWidth - 20) * 0.61, targetHeight);
timelinePanel.primaryAxisSizingMode = 'FIXED';
timelinePanel.counterAxisSizingMode = 'FIXED';
timelinePanel.placeholder = true;

const glassFill = [{
  type: 'SOLID',
  color: { r: 1, g: 250 / 255, b: 239 / 255 },
  opacity: 0.8
}];
const glassStroke = [{
  type: 'SOLID',
  color: { r: 1, g: 1, b: 1 },
  opacity: 0.76
}];
for (const panel of [nowPanel, timelinePanel]) {
  panel.fills = glassFill;
  panel.strokes = glassStroke;
  panel.strokeWeight = 1;
  panel.cornerRadius = 8;
  panel.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 112 / 255, g: 91 / 255, b: 58 / 255, a: 0.15 },
    offset: { x: 14, y: 18 },
    radius: 38,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  }];
}

return {
  createdNodeIds: [wrapper.id, nowPanel.id, timelinePanel.id],
  mutatedNodeIds: [hero.id],
  wrapperId: wrapper.id,
  nowPanelId: nowPanel.id,
  timelinePanelId: timelinePanel.id
};
```

Expected: three new nodes exist inside the hero, remain hidden, and do not affect the visible baseline.

- [ ] **Step 2: Validate the skeleton**

Use `get_metadata` on `wrapperId`.

Expected: horizontal Auto Layout, two children, 20px gap, 39/61 width split, 8px radii, and `visible=false`.

---

### Task 3: Populate the “Now” Panel

**Artifacts:**
- Modify: Figma node `Hero / Now`
- Modify: no repository files

**Interfaces:**
- Consumes: `HeroSkeleton.nowPanelId` plus the existing headline text for its verified font.
- Produces: completed left panel containing the rainbow rail, label, live-time sample, date, and lunar date.

- [ ] **Step 1: Create all left-panel content in one bounded call**

```js
const page = figma.currentPage;
const nowPanel = page.findOne(
  (node) => node.name === 'Hero / Now' && node.type === 'FRAME'
);
const sourceText = page.findOne(
  (node) => node.type === 'TEXT' && node.characters === '把重要的日子，摆在光里。'
);
if (!nowPanel || nowPanel.type !== 'FRAME' || !sourceText || sourceText.type !== 'TEXT') {
  throw new Error('Now panel or source font anchor is unavailable');
}

const fontSegments = sourceText.getStyledTextSegments(['fontName']);
const uniqueFonts = [];
for (const segment of fontSegments) {
  if (!uniqueFonts.some(
    (font) => font.family === segment.fontName.family && font.style === segment.fontName.style
  )) uniqueFonts.push(segment.fontName);
}
for (const font of uniqueFonts) await figma.loadFontAsync(font);
const baseFont = uniqueFonts[0];
const ink = { r: 45 / 255, g: 51 / 255, b: 45 / 255 };
const muted = { r: 116 / 255, g: 120 / 255, b: 111 / 255 };
const brown = { r: 145 / 255, g: 106 / 255, b: 53 / 255 };

function makeText(name, characters, size, color) {
  const node = figma.createText();
  node.name = name;
  node.fontName = baseFont;
  node.characters = characters;
  node.fontSize = size;
  node.lineHeight = { unit: 'AUTO' };
  node.fills = [{ type: 'SOLID', color }];
  return node;
}

const rail = figma.createRectangle();
rail.name = 'Rainbow Rail';
rail.resize(82, 6);
rail.cornerRadius = 8;
rail.fills = [{
  type: 'GRADIENT_LINEAR',
  gradientTransform: [[1, 0, 0], [0, 1, 0]],
  gradientStops: [
    { position: 0, color: { r: 232 / 255, g: 118 / 255, b: 112 / 255, a: 1 } },
    { position: 0.5, color: { r: 120 / 255, g: 181 / 255, b: 156 / 255, a: 1 } },
    { position: 1, color: { r: 168 / 255, g: 146 / 255, b: 187 / 255, a: 1 } }
  ]
}];
nowPanel.appendChild(rail);

const kicker = makeText('Now / Kicker', 'NOW · 现在', 11, brown);
kicker.letterSpacing = { unit: 'PERCENT', value: 9 };
nowPanel.appendChild(kicker);

const clockRow = figma.createAutoLayout('HORIZONTAL', {
  name: 'Now / Clock',
  itemSpacing: 5,
  counterAxisAlignItems: 'MAX'
});
nowPanel.appendChild(clockRow);
const clockMain = makeText('Now / Hour Minute', '09:41', 56, ink);
clockRow.appendChild(clockMain);
const clockSeconds = makeText('Now / Seconds', ':26', 18, brown);
clockRow.appendChild(clockSeconds);

const dateGroup = figma.createAutoLayout('VERTICAL', {
  name: 'Now / Dates',
  itemSpacing: 4
});
nowPanel.appendChild(dateGroup);
const solarDate = makeText('Now / Solar Date', '2026年7月14日 · 星期二', 14, ink);
dateGroup.appendChild(solarDate);
const lunarDate = makeText('Now / Lunar Date', '农历六月初一', 12, muted);
dateGroup.appendChild(lunarDate);

nowPanel.primaryAxisAlignItems = 'SPACE_BETWEEN';
nowPanel.placeholder = false;

return {
  createdNodeIds: [
    rail.id, kicker.id, clockRow.id, clockMain.id,
    clockSeconds.id, dateGroup.id, solarDate.id, lunarDate.id
  ],
  mutatedNodeIds: [nowPanel.id]
};
```

Expected: eight created nodes, no font error, and the left panel has no remaining placeholder shimmer.

- [ ] **Step 2: Validate the left panel visually**

Capture `await nowPanel.screenshot()` or use `get_screenshot` on `nowPanelId`.

Expected: `09:41` is the dominant element, `:26` is visibly subordinate, and no text is clipped.

---

### Task 4: Populate the “Important Moments” Timeline

**Artifacts:**
- Modify: Figma node `Hero / Important Moments`
- Modify: no repository files

**Interfaces:**
- Consumes: `HeroSkeleton.timelinePanelId` and the verified font from the original headline.
- Produces: heading plus three read-only rows representing pinned, nearest, and second-nearest events.

- [ ] **Step 1: Add the timeline header**

```js
const page = figma.currentPage;
const panel = page.findOne(
  (node) => node.name === 'Hero / Important Moments' && node.type === 'FRAME'
);
const sourceText = page.findOne(
  (node) => node.type === 'TEXT' && node.characters === '把重要的日子，摆在光里。'
);
if (!panel || !sourceText || sourceText.type !== 'TEXT') {
  throw new Error('Timeline panel or source font anchor is unavailable');
}

const fontSegments = sourceText.getStyledTextSegments(['fontName']);
const baseFont = fontSegments[0].fontName;
await figma.loadFontAsync(baseFont);
const ink = { r: 45 / 255, g: 51 / 255, b: 45 / 255 };
const muted = { r: 116 / 255, g: 120 / 255, b: 111 / 255 };
const brown = { r: 145 / 255, g: 106 / 255, b: 53 / 255 };

function makeText(name, characters, size, color) {
  const node = figma.createText();
  node.name = name;
  node.fontName = baseFont;
  node.characters = characters;
  node.fontSize = size;
  node.lineHeight = { unit: 'AUTO' };
  node.fills = [{ type: 'SOLID', color }];
  return node;
}

const header = figma.createAutoLayout('HORIZONTAL', {
  name: 'Important Moments / Header',
  itemSpacing: 12,
  counterAxisAlignItems: 'MAX'
});
panel.appendChild(header);
header.resize(panel.width - panel.paddingLeft - panel.paddingRight, 48);
header.layoutSizingHorizontal = 'FILL';
header.primaryAxisAlignItems = 'SPACE_BETWEEN';

const titleGroup = figma.createAutoLayout('VERTICAL', {
  name: 'Important Moments / Titles',
  itemSpacing: 4
});
header.appendChild(titleGroup);
const kicker = makeText('Important Moments / Kicker', 'IMPORTANT MOMENTS', 11, brown);
kicker.letterSpacing = { unit: 'PERCENT', value: 9 };
titleGroup.appendChild(kicker);
const title = makeText('Important Moments / Title', '重要时间', 20, ink);
titleGroup.appendChild(title);
const hint = makeText('Important Moments / Hint', '置顶 + 最近两项', 11, muted);
header.appendChild(hint);

return {
  createdNodeIds: [header.id, titleGroup.id, kicker.id, title.id, hint.id],
  mutatedNodeIds: [panel.id]
};
```

Expected: the header is readable in one line at the desktop target width and contains no interactive control.

- [ ] **Step 2: Add the three rows using one row per `use_figma` call**

Run the following self-contained script three times. For each invocation, set `data` to exactly one of the three literal objects listed after the script. Keeping one row per invocation preserves the ten-operation limit.

```js
const data = {
  name: 'Pinned',
  days: '128',
  status: '天后',
  title: '结婚纪念日',
  date: '2026年11月19日 · 星期四',
  pinned: true,
  barColor: { r: 232 / 255, g: 118 / 255, b: 112 / 255 }
};

const page = figma.currentPage;
const panel = page.findOne(
  (node) => node.name === 'Hero / Important Moments' && node.type === 'FRAME'
);
const sourceText = page.findOne(
  (node) => node.type === 'TEXT' && node.characters === '把重要的日子，摆在光里。'
);
if (!panel || !sourceText || sourceText.type !== 'TEXT') {
  throw new Error('Timeline panel or source font anchor is unavailable');
}

const fonts = sourceText.getStyledTextSegments(['fontName']).map((segment) => segment.fontName);
const baseFont = fonts[0];
await figma.loadFontAsync(baseFont);
const ink = { r: 45 / 255, g: 51 / 255, b: 45 / 255 };
const muted = { r: 116 / 255, g: 120 / 255, b: 111 / 255 };

function makeText(name, characters, size, color) {
  const node = figma.createText();
  node.name = name;
  node.fontName = baseFont;
  node.characters = characters;
  node.fontSize = size;
  node.lineHeight = { unit: 'AUTO' };
  node.fills = [{ type: 'SOLID', color }];
  return node;
}

const row = figma.createAutoLayout('HORIZONTAL', {
  name: `Moment / ${data.name}`,
  paddingTop: 10,
  paddingRight: 12,
  paddingBottom: 10,
  paddingLeft: 12,
  itemSpacing: 12,
  counterAxisAlignItems: 'CENTER'
});
panel.appendChild(row);
row.resize(panel.width - panel.paddingLeft - panel.paddingRight, 70);
row.layoutSizingHorizontal = 'FILL';
row.cornerRadius = 8;
row.strokes = [{
  type: 'SOLID',
  color: data.pinned
    ? { r: 232 / 255, g: 118 / 255, b: 112 / 255 }
    : { r: 121 / 255, g: 103 / 255, b: 72 / 255 },
  opacity: data.pinned ? 0.24 : 0.12
}];
row.fills = [{
  type: 'SOLID',
  color: data.pinned
    ? { r: 1, g: 244 / 255, b: 227 / 255 }
    : { r: 1, g: 1, b: 1 },
  opacity: data.pinned ? 0.5 : 0.34
}];

const days = figma.createAutoLayout('VERTICAL', {
  name: `${data.name} / Days`,
  itemSpacing: 4,
  counterAxisAlignItems: 'CENTER'
});
row.appendChild(days);
days.appendChild(makeText(`${data.name} / Number`, data.days, 22, ink));
days.appendChild(makeText(`${data.name} / Status`, data.status, 10, muted));

const copy = figma.createAutoLayout('VERTICAL', {
  name: `${data.name} / Copy`,
  itemSpacing: 4
});
row.appendChild(copy);
copy.layoutSizingHorizontal = 'FILL';
copy.appendChild(makeText(
  `${data.name} / Title`,
  data.pinned ? `${data.title} · 置顶` : data.title,
  14,
  ink
));
copy.appendChild(makeText(`${data.name} / Date`, data.date, 11, muted));

const bar = figma.createRectangle();
bar.name = `${data.name} / Accent`;
bar.resize(8, 34);
bar.cornerRadius = 8;
bar.fills = [{ type: 'SOLID', color: data.barColor }];
row.appendChild(bar);

return {
  createdNodeIds: [
    row.id, days.id, ...days.children.map((node) => node.id),
    copy.id, ...copy.children.map((node) => node.id), bar.id
  ],
  mutatedNodeIds: [panel.id]
};
```

Invocation data, in order:

```js
{
  name: 'Pinned', days: '128', status: '天后', title: '结婚纪念日',
  date: '2026年11月19日 · 星期四', pinned: true,
  barColor: { r: 232 / 255, g: 118 / 255, b: 112 / 255 }
}
```

```js
{
  name: 'Nearest', days: '12', status: '天后', title: '旅行出发',
  date: '2026年7月26日 · 星期日', pinned: false,
  barColor: { r: 120 / 255, g: 181 / 255, b: 156 / 255 }
}
```

```js
{
  name: 'Second Nearest', days: '36', status: '天后', title: '七夕',
  date: '2026年8月19日 · 星期三', pinned: false,
  barColor: { r: 134 / 255, g: 184 / 255, b: 215 / 255 }
}
```

Expected after the third call: exactly three rows in pinned/nearest/second-nearest order, with text labels carrying meaning independently of color.

- [ ] **Step 3: Finish and validate the timeline panel**

```js
const panel = figma.currentPage.findOne(
  (node) => node.name === 'Hero / Important Moments' && node.type === 'FRAME'
);
if (!panel) throw new Error('Timeline panel is unavailable');
const rows = panel.findAll(
  (node) => node.type === 'FRAME' && node.name.startsWith('Moment / ')
);
if (rows.length !== 3) {
  throw new Error(`Expected 3 timeline rows, found ${rows.length}`);
}
panel.placeholder = false;
await panel.screenshot();
return { mutatedNodeIds: [panel.id], rowIds: rows.map((row) => row.id) };
```

Expected: three 70px rows, no clipped titles or dates, no buttons or interaction affordances, and no shimmer.

---

### Task 5: Cut Over to the New Hero Without Touching Siblings

**Artifacts:**
- Modify: the discovered hero frame
- Remove: only `HeroBaseline.oldLeftId` and `HeroBaseline.oldRightId`
- Reveal: `HeroSkeleton.wrapperId`

**Interfaces:**
- Consumes: `HeroBaseline`, `HeroSkeleton`, completed left and right panels.
- Produces: visible replacement hero and `CutoverResult` containing the removed and mutated IDs.

- [ ] **Step 1: Verify both panels before destructive cutover**

Use `get_metadata` on `wrapperId` and assert:

- two direct child panels exist;
- neither panel has `placeholder=true`;
- the left panel contains `09:41`, `:26`, solar date, and lunar date;
- the right panel contains exactly three `Moment /` rows;
- wrapper dimensions equal `HeroBaseline.targetBounds.width` and `HeroBaseline.targetBounds.height`.

Expected: all assertions pass. If any fail, fix the replacement while it remains hidden.

- [ ] **Step 2: Remove only the two old subtrees and reveal the replacement**

```js
const page = figma.currentPage;
const wrapper = page.findOne(
  (node) => node.name === 'Hero / Today Timeline' && node.type === 'FRAME'
);
const headline = page.findOne(
  (node) => node.type === 'TEXT' && node.characters === '把重要的日子，摆在光里。'
);
const dialTitle = page.findOne(
  (node) => node.type === 'TEXT' && node.characters === '等待置顶'
);
if (!wrapper || !headline || !dialTitle) {
  throw new Error('Cutover nodes are unavailable; stop without changing the file');
}

function directChildContaining(parent, descendant) {
  return parent.children.find(
    (node) => node.id === descendant.id || (
      'findOne' in node && node.findOne((child) => child.id === descendant.id)
    )
  );
}

const hero = wrapper.parent;
if (!hero || !('children' in hero)) {
  throw new Error('Replacement wrapper has no valid hero parent');
}
const oldLeft = directChildContaining(hero, headline);
const oldRight = directChildContaining(hero, dialTitle);
if (!oldLeft || !oldRight || oldLeft.id === oldRight.id) {
  throw new Error('Could not resolve the two old hero subtrees');
}
if (oldLeft.parent?.id !== wrapper.parent?.id || oldRight.parent?.id !== wrapper.parent?.id) {
  throw new Error('Old and new hero nodes do not share the expected parent');
}

const removedNodeIds = [oldLeft.id, oldRight.id];
oldLeft.remove();
oldRight.remove();
wrapper.visible = true;
wrapper.placeholder = false;

return {
  removedNodeIds,
  mutatedNodeIds: [wrapper.id, hero.id]
};
```

Expected: the old marketing-copy and dial subtrees are gone, the new hero is visible, and no other direct child is removed.

- [ ] **Step 3: Capture the first visible screenshot**

Capture the hero screenshot immediately after cutover.

Expected: left panel shows the current-time hierarchy; right panel shows three important moments; the rest of the homepage frame is visually unchanged.

---

### Task 6: Validate Desktop, Narrow Layout, and Change Isolation

**Artifacts:**
- Inspect: final hero and page
- Create/remove temporarily: one narrow-layout clone of the new wrapper
- Modify permanently: nothing beyond Task 5

**Interfaces:**
- Consumes: `HeroBaseline.pageSiblingFingerprint`, `HeroBaseline.parentSiblingFingerprint`, and final `wrapperId`.
- Produces: final desktop screenshot, temporary 390px narrow screenshot, metadata report, and empty page/parent sibling diffs.

- [ ] **Step 1: Validate final desktop structure and visible bounds**

Use `get_metadata` and a final screenshot on the hero.

Expected:

- wrapper is visible and has exactly two panels;
- no node named `Hero / Today Timeline`, `Hero / Now`, or `Hero / Important Moments` has `placeholder=true`;
- no text node is clipped;
- no panel overlaps the floating header or the next homepage section.

- [ ] **Step 2: Render a temporary 390px stacked variant and remove it**

```js
const page = figma.currentPage;
const wrapper = page.findOne(
  (node) => node.name === 'Hero / Today Timeline' && node.type === 'FRAME'
);
if (!wrapper) throw new Error('Final hero wrapper is unavailable');

const clone = wrapper.clone();
clone.name = 'Hero / Narrow QA Temporary';
page.appendChild(clone);
const rightEdge = page.children
  .filter((node) => node.id !== clone.id)
  .reduce((max, node) => Math.max(max, node.x + node.width), 0);
clone.x = rightEdge + 120;
clone.y = 0;
clone.layoutMode = 'VERTICAL';
clone.itemSpacing = 12;
clone.resize(390, wrapper.height * 2 + 12);
clone.primaryAxisSizingMode = 'AUTO';
clone.counterAxisSizingMode = 'FIXED';

for (const panel of clone.children) {
  if (panel.type !== 'FRAME') continue;
  panel.resize(390, panel.height);
  panel.layoutSizingHorizontal = 'FILL';
}

const temporaryRemovedNodeIds = [
  clone.id,
  ...clone.findAll(() => true).map((node) => node.id)
];
await clone.screenshot();
clone.remove();

return { temporaryRemovedNodeIds };
```

Expected: the narrow preview stacks `Now` above `Important Moments`, keeps all three rows visible, and has no horizontal overflow or clipped text. No temporary clone remains on the page.

- [ ] **Step 3: Compare all page-level siblings against the baseline**

Run this read-only script and compare its returned arrays with `HeroBaseline.pageSiblingFingerprint` and `HeroBaseline.parentSiblingFingerprint` by `id`, `name`, `x`, `y`, `width`, `height`, and `visible`:

```js
const page = figma.currentPage;
const wrapper = page.findOne(
  (node) => node.name === 'Hero / Today Timeline' && node.type === 'FRAME'
);
if (!wrapper || !wrapper.parent || wrapper.parent.type === 'PAGE') {
  throw new Error('Could not resolve the final hero container');
}
const hero = wrapper.parent;
const pageSiblingFingerprint = page.children
  .filter((node) => node.id !== hero.id)
  .map((node) => ({
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    visible: node.visible
  }));
const parentSiblingFingerprint = hero.children
  .filter((node) => node.id !== wrapper.id)
  .map((node) => ({
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    visible: node.visible
  }));
return { pageSiblingFingerprint, parentSiblingFingerprint };
```

Expected: both `pageSiblingDiff` and `parentSiblingDiff` are empty arrays.

- [ ] **Step 4: Final cleanup audit**

Search the target page with this read-only script:

```js
const page = figma.currentPage;
const placeholders = page.findAll(
  (node) => 'placeholder' in node && node.placeholder === true
).map((node) => ({ id: node.id, name: node.name }));
const hiddenWrappers = page.findAll(
  (node) => node.name === 'Hero / Today Timeline' && node.visible === false
).map((node) => ({ id: node.id, name: node.name }));
const nowPanels = page.findAll(
  (node) => node.name === 'Hero / Now'
).map((node) => ({ id: node.id, name: node.name }));
const timelinePanels = page.findAll(
  (node) => node.name === 'Hero / Important Moments'
).map((node) => ({ id: node.id, name: node.name }));
const temporaryNodes = page.findAll(
  (node) => node.name === 'Hero / Narrow QA Temporary'
).map((node) => ({ id: node.id, name: node.name }));
return {
  placeholders,
  hiddenWrappers,
  nowPanels,
  timelinePanels,
  temporaryNodes
};
```

Verify:

- nodes with `placeholder=true`;
- hidden nodes named `Hero / Today Timeline`;
- duplicate nodes named `Hero / Now` or `Hero / Important Moments`;
- temporary narrow-layout clones.

Expected: no leftover placeholders, hidden replacements, duplicate hero panels, or temporary nodes.

- [ ] **Step 5: Record the final evidence**

Return the final hero ID, all permanently created/mutated/removed IDs, the desktop screenshot, the narrow screenshot, and both empty sibling diffs. Do not stage or commit repository files because the execution changes only Figma.
