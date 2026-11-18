# Builly Visual Builder — UX/UI Redesign Specification

**Version:** 1.0  
**Status:** Proposed product specification  
**Design direction:** Calm Professional Creative IDE

---

## 1. Product Intent

ปรับปรุง Visual Builder ให้เป็นเครื่องมือสร้างเว็บไซต์ระดับมืออาชีพที่มีความสามารถครบ แต่ไม่ทำให้ผู้ใช้รู้สึกว่าทุกอย่างแออัดหรือซับซ้อนเกินไป

### 1.1 Core UX outcomes

1. ผู้ใช้มองเห็นพื้นที่ Canvas เป็นพื้นที่ทำงานหลัก
2. ผู้ใช้ค้นหาและเพิ่ม Element ได้รวดเร็ว
3. ผู้ใช้เข้าใจ Property ที่กำลังแก้ไข โดยไม่ต้องอ่าน technical metadata มากเกินไป
4. Numeric inputs และ controls อ่านค่าได้ชัดเจนและแก้ไขได้แม่นยำ
5. ผู้ใช้เข้าถึง advanced features ได้โดยไม่ต้องแสดงทั้งหมดตลอดเวลา
6. รูปแบบ UI สอดคล้องกันทุก Panel และทุก feature
7. การ redesign ไม่ทำให้ความสามารถเดิมหายไป

### 1.2 Design principle

**Professional Density, not Maximum Density.**

- Feature completeness: คงความสามารถเดิม
- Progressive disclosure: แสดงสิ่งที่จำเป็นก่อน เปิดรายละเอียดเพิ่มเติมเมื่อผู้ใช้ต้องการ
- Clear hierarchy: ใช้ typography, spacing และ grouping แทนการตีกรอบทุก control
- Direct manipulation: ค่าที่แก้ไขได้ต้องชัดเจนและตอบสนองทันที
- Predictability: control ประเภทเดียวกันต้องทำงานเหมือนกัน
- Reversibility: ผู้ใช้ยกเลิกหรือย้อนการเปลี่ยนแปลงได้ตามระบบเดิม
- Accessibility: focus, keyboard, contrast และ target size ต้องเหมาะสม

---

## 2. Target Workspace Structure

คงโครงสร้าง 3 พื้นที่หลักไว้ แต่ปรับสัดส่วนและพฤติกรรม

### 2.1 Workspace regions

| Region | Initial target width | Responsibility |
|---|---:|---|
| Left Library Panel | 260–290px | Element Library, Layers, Pages, Assets และ entry points ที่มีอยู่ |
| Canvas | Flexible | Preview, selection, editing และ responsive viewport |
| Right Inspector Panel | 350–390px | Contextual properties ของ Element/Page ที่เลือก |
| Top Toolbar | Existing height; simplify hierarchy | Global actions, device preview, save status, preview/publish |

ค่าความกว้างเป็นค่าเริ่มต้นสำหรับ desktop เท่านั้น ต้องทดสอบกับ viewport จริง และรองรับ resize/collapse

### 2.2 Panel behavior

- Left และ Right panel สามารถ collapse/expand ได้
- ผู้ใช้ปรับความกว้าง panel ได้ หาก architecture ปัจจุบันรองรับอย่างปลอดภัย
- จดจำ panel visibility/width เป็น UI preference ได้ แต่ต้องไม่ใช้เป็น canonical project data
- เมื่อ panel ถูกย่อ Canvas ต้องขยายพื้นที่โดยไม่ reset selection หรือ viewport state
- ห้าม panel overlay Canvas โดยไม่ตั้งใจ
- เมื่อพื้นที่หน้าจอไม่พอ ให้ใช้ responsive workspace mode แทนการบีบ control ให้เล็กลง

### 2.3 Canvas priority

Canvas ต้องได้พื้นที่มากที่สุดเท่าที่เป็นไปได้

- แยก Canvas workspace background ออกจาก website content
- Website viewport อยู่กึ่งกลางในพื้นที่ Canvas เมื่อเหมาะสม
- Selection outline ชัดเจนแต่ไม่บดบัง content
- Breadcrumb แสดง hierarchy ของ selection
- Zoom, fit-to-screen และ device preview อยู่ในกลุ่มควบคุมที่คาดเดาได้
- Focus Mode ซ่อน side panels และเพิ่มพื้นที่ Canvas
- การเปิด/ปิด panel หรือเปลี่ยน zoom ต้องไม่เปลี่ยน document data

---

## 3. Left Panel — Organized Library

### 3.1 Navigation

คง feature entry points เดิมทั้งหมด แต่จัดกลุ่มและลำดับใหม่ตาม workflow ปัจจุบัน เช่น:

- Elements
- Layers
- Pages
- Assets
- CMS / Data
- Code หรือเครื่องมืออื่นที่มีอยู่เดิม

ห้ามลบ entry point เดิมเพียงเพราะไม่อยู่ในรายการตัวอย่างนี้

### 3.2 Elements library

- มี search ที่เห็นได้ชัดและค้นหาจากชื่อ/คำอธิบาย/หมวดหมู่ได้ตามข้อมูลที่มี
- แบ่งหมวดหมู่ตามงาน เช่น Layout, Content, Media, Forms & UI, Data, Advanced
- ใช้ Accordion หรือ category navigation
- รองรับ Compact List และ Grid view หากทำได้โดยไม่เพิ่มความซับซ้อนเกินจำเป็น
- Card/row ต้องไม่แสดงคำอธิบายยาวตลอดเวลา
- แสดงคำอธิบายเต็มผ่าน tooltip หรือ detail-on-demand
- Add/Favorite/drag affordance แสดงตาม interaction context เช่น hover/focus ไม่จำเป็นต้องแสดงทุก action พร้อมกัน
- Search result ต้องแสดงชื่อและชนิดที่เข้าใจง่าย
- Empty state ต้องบอกวิธีค้นหาหรือเปลี่ยนหมวดหมู่

### 3.3 Layers, Pages, Assets

- รักษาพฤติกรรมเดิมทั้งหมด
- ใช้ indentation, icons และ spacing เพื่อสื่อ hierarchy
- แยก selected, hover, locked, hidden และ disabled state อย่างชัดเจน
- หลีกเลี่ยงการใช้สีหลายสีโดยไม่มีความหมาย
- การ rename, reorder, hide/show, lock/unlock ต้องยังทำงานเหมือนเดิม

---

## 4. Right Panel — Contextual Property Inspector

Right Panel เป็นพื้นที่ที่ต้องให้ความสำคัญสูงสุดในการ redesign

### 4.1 Panel header

แสดง:
- ชื่อ Element หรือ Page ที่เลือก
- ประเภท Element เป็น secondary metadata
- context ที่จำเป็น เช่น breakpoint/device
- action ที่มีอยู่เดิม เช่น duplicate, delete, favorite/bookmark หากมี

ข้อกำหนด:
- ชื่อไม่ถูกตัดจนอ่านไม่รู้เรื่อง
- action ที่ไม่ค่อยใช้รวมใน overflow menu ได้ แต่ต้องไม่ลบความสามารถ
- icon-only action ต้องมี tooltip และ accessible label

### 4.2 Primary tabs

คง tab ที่มีอยู่เดิม เช่น Content, Style, Responsive, Advanced หากตรงกับ implementation ปัจจุบัน

หลักการ:
- Tab label อ่านชัด ไม่ใช้ abbreviation ที่ไม่จำเป็น
- Active state ต้องมองเห็นได้ชัด
- เปลี่ยน tab แล้ว selection และ unsaved edits ต้องไม่สูญหาย
- อย่าย้าย property ไป tab อื่นโดยไม่ตรวจสอบความคาดหวังและ dependency

### 4.3 Property grouping

จัดกลุ่ม property ตามความหมายของผู้ใช้ ไม่ใช่ตามชื่อ CSS implementation เพียงอย่างเดียว

กลุ่มที่แนะนำ:
1. Content
2. Layout
3. Sizing
4. Spacing
5. Typography
6. Background
7. Border & Effects
8. Responsive
9. Advanced

รายการจริงต้องขึ้นกับ Element type และ property ที่รองรับ ห้ามแสดงกลุ่มที่ไม่มีผลกับ Element นั้นโดยไม่มีเหตุผล

### 4.4 Progressive disclosure

- เปิดกลุ่มที่ใช้บ่อยหรือสัมพันธ์กับ property ที่ผู้ใช้กำลังแก้ไข
- กลุ่มอื่นสามารถ collapse ได้
- จำสถานะ accordion เป็น UI preference ได้
- ไม่ซ่อน property สำคัญจนผู้ใช้หาไม่พบ
- Advanced properties ต้องค้นหา/เข้าถึงได้อย่างมีโครงสร้าง
- ไม่ควรเปิดทุก accordion พร้อมกันเป็นค่าเริ่มต้น หากทำให้ panel ยาวและหนาแน่นเกินไป

---

## 5. Numeric Input & Sizing Controls

### 5.1 Problem to solve

จากหน้าจออ้างอิง ช่อง Sizing มีพื้นที่แสดงค่าตัวเลขไม่เพียงพอ ทำให้มองไม่เห็นค่าที่พิมพ์และแก้ไขยาก นี่เป็น usability defect ไม่ใช่เพียง visual preference

### 5.2 Standard numeric field

ทุก numeric control ต้อง:
- มี label เหนือ input
- มีพื้นที่แสดงค่าที่เพียงพอ
- ใช้ font size ที่อ่านง่าย
- แยก value กับ unit ชัดเจน
- แสดง current value จริง ไม่ใช้ placeholder แทนค่า
- รองรับ keyboard editing และ select-all
- รองรับค่าทศนิยมเมื่อ property รองรับ
- มี validation และ error message ใกล้ field
- มี focus state ชัดเจน
- ไม่ตัดเลขหลักท้ายหรือซ่อน cursor
- ไม่เปลี่ยนค่าโดยไม่ตั้งใจเมื่อ focus/blur
- รองรับ unset/auto/inherit/none ตาม semantics ของ property จริง

### 5.3 Recommended dimensions

| Property | Recommended |
|---|---|
| Input height | 38–42px |
| Input font size | 14px minimum |
| Label font size | 12–13px |
| Field gap | 8–12px |
| Group spacing | 16–24px |
| Unit control | 64–80px target width where separate |
| Value control | Flexible; usually at least 90–110px |

ค่าข้างต้นเป็น design targets ต้องปรับตามความกว้าง panel และ localization

### 5.4 Value and unit layout

Preferred:
- Value field มีพื้นที่หลัก
- Unit เป็น Select/Suffix ที่แยกชัด
- อย่ารวม value และ unit ใน input เดียว หากทำให้การแก้ไขหรือ parsing ไม่แน่นอน
- Unit options ต้องตรงกับ property เช่น px, %, rem, em, vh, vw, auto ตามความสามารถจริง
- ห้ามเสนอ unit ที่ระบบเดิมไม่รองรับ

### 5.5 Sizing group

จัด Width / Height และ Min / Max เป็น field ที่อ่านง่าย อาจใช้ 2-column grid เมื่อ panel กว้างพอ และเปลี่ยนเป็น single-column เมื่อพื้นที่แคบ

Quick presets ที่อาจมี:
- Auto
- 100%
- Fit Content
- Full Width
- Max width presets

ใช้เฉพาะ preset ที่ mapping กับ semantics ของระบบจริงได้อย่างปลอดภัย ไม่ hardcode ค่า CSS ที่ทำให้ค่าปัจจุบันเสียหาย

### 5.6 Numeric interaction behavior

- Typing should not be interrupted by rerender.
- Preserve intermediate input states where necessary (e.g. "-", "1.", empty while editing) without prematurely coercing to zero.
- Commit behavior must match existing builder history/undo model.
- Avoid creating one undo-history entry per keystroke if existing architecture supports commit/debounce boundaries.
- Arrow keys may increment/decrement only where expected; respect step and modifier behavior.
- Unit change must preserve or intentionally convert value according to existing semantics. Never silently reinterpret 100px as 100%.
- Invalid input must not corrupt stored property state.
- Reset should restore the correct inherited/default state, not merely write zero.

---

## 6. Spacing & Box Model

- แสดง Margin และ Padding แยกชัดเจน
- Diagram ต้องอ่านง่ายและไม่กินพื้นที่มากเกินไป
- ค่าแต่ละด้านต้องกดแก้ได้จริงและมี focus state
- รองรับ link/unlink sides
- มี Box / Shorthand / Logical views หากระบบเดิมรองรับ
- Clear spacing ต้องแสดง confirmation หรือ undo path ตามความเสี่ยง
- เมื่อใช้ shorthand ต้องแสดง mapping ที่ชัดเจน
- ไม่ใช้สีสดหลายสีเกินจำเป็น; สีใช้สื่อความแตกต่างระหว่าง Margin/Padding เท่านั้น

---

## 7. Responsive Properties

- แสดง breakpoint/device context ชัดเจน
- ผู้ใช้รู้ว่ากำลังแก้ค่า Base, Tablet หรือ Mobile
- แยก inherited value กับ locally overridden value ให้เข้าใจได้
- มี action reset-to-inherited เฉพาะเมื่อระบบรองรับ
- ห้ามทำให้ค่า breakpoint หนึ่งเขียนทับอีก breakpoint โดยไม่ตั้งใจ
- Switching breakpoint ต้องไม่เปลี่ยน selected element หรือทำให้ draft สูญหาย
- ทดสอบ cascade และ fallback ของ responsive properties ก่อน/หลัง redesign

---

## 8. Visual Language

### 8.1 Overall style

**Calm Professional Creative IDE**

- Neutral workspace surfaces
- Clear typography
- Restrained accent color
- Subtle separators
- Limited use of cards
- Consistent control geometry
- Comfortable density
- Minimal decorative effects

### 8.2 Avoid

- Card around every control
- Too many nested borders
- Tiny labels and values
- Excessive metadata
- Multiple competing accent colors
- Heavy shadows and gradients
- Excessively rounded controls that waste space
- Icons without labels/tooltips where meaning is unclear
- Hiding common actions several levels deep

### 8.3 Interaction states

Every interactive control must define:
- Default
- Hover
- Focus-visible
- Active/pressed
- Selected
- Disabled
- Loading (when applicable)
- Error/invalid (when applicable)

---

## 9. Responsive Workspace Behavior

### Desktop / wide screens
- Three-region layout
- Resizable/collapsible side panels
- Canvas receives remaining width

### Medium screens
- Allow one side panel to collapse automatically only if user can restore it easily
- Property fields switch to one column
- Avoid reducing input width below usable minimum

### Narrow screens
- Use a dedicated workspace mode, drawer, or panel switching pattern
- Do not squeeze all three regions into narrow width
- Canvas remains accessible
- Preserve current editing context while switching panel views

Do not assume mobile editing parity if the current product does not support it. Audit current responsive behavior first.

---

## 10. Accessibility & Localization

- Keyboard navigation for all panels and controls
- Visible focus ring
- Proper label association
- Accessible names for icon buttons
- Do not rely on color alone for state
- Maintain sufficient text and control contrast
- Support Thai and English strings without clipping
- Allow longer translated labels to wrap or use responsive spacing
- Numeric controls must handle locale safely while storing canonical numeric values
- Avoid mixing technical English metadata into Thai labels unless it is useful to the user

---

## 11. Preserve Existing Functionality

This redesign is a presentation and interaction improvement, not a rewrite of the Builder engine.

Must preserve and regression-test:
- Element insertion
- Drag and drop
- Selection and multi-selection if supported
- Layers hierarchy
- Property editing
- Content editing
- Style editing
- Responsive breakpoints
- Page management
- Theme/layout management
- Undo/redo
- Autosave/manual save
- Preview
- Publish
- CMS/data connections
- Form configuration
- Version history, preview and rollback
- Existing keyboard shortcuts
- Existing permissions and validation

Any discovered behavior not listed here must also be preserved unless explicitly approved for change.

---

## 12. Acceptance Criteria

### Workspace
- [ ] Canvas has clear visual priority.
- [ ] Left and right panels can be collapsed/restored without losing selection.
- [ ] Panel widths do not cause controls to become unusable.
- [ ] Workspace remains usable at supported viewport sizes.

### Left Panel
- [ ] Search is easy to find and use.
- [ ] Categories are scannable.
- [ ] Element actions do not visually clutter every item.
- [ ] Existing library features remain available.

### Property Inspector
- [ ] Labels and values are readable.
- [ ] Related properties are grouped logically.
- [ ] Progressive disclosure reduces initial visual density.
- [ ] All existing properties remain discoverable.

### Numeric Controls
- [ ] Typed values remain visible at all times.
- [ ] No clipping of digits or cursor.
- [ ] Value and unit are visually distinct.
- [ ] Keyboard editing works.
- [ ] Empty/intermediate input states do not become unintended zero values.
- [ ] Undo/redo behavior remains correct.
- [ ] Unit changes do not silently reinterpret values.

### Regression
- [ ] Existing Builder workflows pass.
- [ ] Save/reload preserves changes.
- [ ] Preview/publish output remains equivalent for unchanged content.
- [ ] Responsive values remain correct.
- [ ] No new React hook order/runtime errors.

---

## 13. Out of Scope Without Separate Approval

- Rewriting the document model or Builder engine
- Replacing state management
- Changing CMS or Google Sheets data schema
- Changing authentication or Workspace OAuth
- Changing save/publish architecture
- Removing Firebase/localStorage migration paths before validated migration
- Removing existing features
- Replacing the component library wholesale
- Changing public site rendering behavior
