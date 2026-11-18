# Builly Visual Builder UX/UI Redesign Pack

เอกสารชุดนี้กำหนดทิศทางและแผนปรับปรุง UX/UI ของ Builly Visual Builder โดยยึดแนวทาง **Calm Professional Creative IDE** เป้าหมายคือทำให้ Workspace สบายตา อ่านง่าย และใช้งานสะดวกขึ้น โดยไม่ลดความสามารถเดิมหรือเปลี่ยน Business Logic โดยไม่จำเป็น

## เอกสารในชุดนี้

- `docs/BUILDER_UX_UI_SPEC.md` — Product/UX/UI specification, layout, interaction, components, responsive behavior และ acceptance criteria
- `docs/BUILDER_DESIGN_SYSTEM.md` — Design tokens และมาตรฐาน component
- `docs/REDESIGN_IMPLEMENTATION_PLAN.md` — Audit-first implementation phases, migration safety, QA checklist
- `prompts/GOOGLE_AI_STUDIO_REDESIGN_MASTER_PROMPT.md` — Master Prompt สำหรับให้ Google AI Studio ตรวจสอบและดำเนินการกับ codebase จริง

## วิธีใช้

1. นำ ZIP นี้เข้าเป็น reference ให้ Google AI Studio หรือเปิดไฟล์เอกสารใน project context
2. ส่งเนื้อหา `GOOGLE_AI_STUDIO_REDESIGN_MASTER_PROMPT.md` ให้ AI Studio
3. ให้ AI ทำ Phase 0 Audit และรายงานก่อน ห้ามเริ่มแก้โค้ดทันที
4. ตรวจสอบรายงานและอนุมัติการลงมือทำเป็น phase
5. ทดสอบ Builder workflows เดิมทุกครั้งก่อน merge/deploy

## ข้อกำหนดสำคัญ

- เอกสารนี้เป็น specification ไม่ใช่การแก้ source code จริง
- ต้องตรวจสอบ implementation ปัจจุบันก่อนสรุปชื่อไฟล์หรือโครงสร้างจริง
- ห้ามลบหรือเขียนทับระบบเดิมเพียงเพื่อให้ UI ตรงกับตัวอย่าง
- ห้ามเปลี่ยน data model, builder state, persistence, save/publish, CMS, responsive logic หรือ version history โดยไม่มีเหตุผลและแผน migration ที่ได้รับอนุมัติ
