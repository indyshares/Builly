# Builly CMS Reliability, Google Workspace Sync & Data Management Pack

ชุดเอกสารนี้กำหนดงานแก้ไขปัญหา CMS ที่พบจากภาพหน้าจอและวางระบบจัดการข้อมูลใหม่อย่างปลอดภัย โดยครอบคลุม:

- แก้บัค `Title is required` ทั้งที่กรอก Title แล้ว
- ตรวจสอบและปรับ Sheet Structure ให้สอดคล้องกับ CMS ปัจจุบัน
- ระบบ CMS Management สำหรับค้นหา แก้ไข ลบ และล้างข้อมูล
- Google Drive import ที่จำกัดเฉพาะ Folder ที่ผู้ใช้เลือก/อนุญาต
- Google Sheets sync ที่มีขั้นตอน สถานะ ผลลัพธ์ และการกู้คืนชัดเจน
- Security, authorization, validation, audit log และ destructive-action safeguards

## ไฟล์

- `docs/CMS_RELIABILITY_AND_DATA_MANAGEMENT_SPEC.md` — Product, UX, data, security และ acceptance specification
- `docs/GOOGLE_WORKSPACE_SYNC_SPEC.md` — Drive/Sheets connection, folder scope, sync state machine และ recovery
- `docs/SHEET_STRUCTURE_MIGRATION_PLAN.md` — audit, mapping, migration, cutover และ rollback
- `prompts/GOOGLE_AI_STUDIO_CMS_RELIABILITY_MASTER_PROMPT.md` — Master Prompt สำหรับ Google AI Studio

## วิธีดำเนินงาน

1. ให้ Google AI Studio อ่านเอกสารทั้งหมด
2. เริ่มจาก Audit เท่านั้น ห้ามแก้โค้ดหรือแก้ข้อมูลจริงทันที
3. ตรวจสอบ schema, API, OAuth scopes, folder IDs, sync implementation และ validation path
4. เสนอ migration plan พร้อม mapping และ rollback
5. เริ่ม implement หลังเจ้าของอนุมัติแผน
6. ทดสอบด้วย test data ก่อน production migration

## ข้อควรระวัง

- เอกสารนี้ไม่ได้ยืนยันว่า source code ปัจจุบันมีโครงสร้างตามที่คาด ต้องตรวจสอบจาก codebase จริง
- ห้ามล้างหรือลบข้อมูลจริงระหว่าง audit หรือทดสอบ
- ห้าม sync ทั้ง Drive หรือทั้ง Spreadsheet โดยไม่มี explicit scope
- ห้ามถือว่าการกดปุ่มเท่ากับ operation สำเร็จ ต้องรอผลจาก backend และแสดงสถานะจริง
