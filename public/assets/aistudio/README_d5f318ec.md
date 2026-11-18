# Builly — Landing Page Implementation Pack

ชุดเอกสารสำหรับใช้กับ Google AI Studio ใน repository ปัจจุบัน

เป้าหมาย: เพิ่ม Landing Page เป็นหน้าแรกก่อนเข้าสู่ Visual Builder เดิม พร้อม Google sign-in เพื่อระบุตัวเจ้าของ และ Workspace OAuth แยกเพื่อเชื่อม Google Drive/Sheets

อ่านตามลำดับ:
1. docs/PRODUCT_AND_UX_SPEC.md
2. docs/AUTH_AND_WORKSPACE_FLOW.md
3. docs/TECHNICAL_ARCHITECTURE.md
4. docs/IMPLEMENTATION_PLAN.md
5. prompts/GOOGLE_AI_STUDIO_IMPLEMENTATION_PROMPT.md

ข้อห้ามหลัก:
- ห้าม rewrite หรือลบ Visual Builder/CMS เดิมในงาน Landing Page
- Supabase ใช้ Authentication เท่านั้น ไม่เก็บ website/page/CMS data
- Google Drive/Sheets ของผู้ใช้เป็น canonical source
- Google sign-in และ Google Workspace consent เป็นคนละขั้นตอน
- ห้ามเก็บ Google refresh token ใน browser
- ทำ phased migration พร้อม regression tests
