# Builly — Product & UX Specification

## Product intent
Builly เป็น Visual Website Builder ที่มี Landing Page เป็นหน้าแรกต้อนรับ ก่อนผู้ใช้เริ่มสร้างเว็บไซต์ใน Visual Builder เดิม ทั้งสองส่วนเป็นผลิตภัณฑ์เดียวกันและใช้บัญชีเจ้าของเดียวกัน

## Primary journey
1. ผู้ใช้เปิด `/` เห็น Landing Page
2. กด Start Building / Get Started
3. Login ด้วย Google ผ่าน Supabase Auth
4. ระบบสร้างหรือระบุตัว Builly owner จาก Supabase user ID
5. ตรวจสถานะ Google Workspace connection
6. หากยังไม่เชื่อม ให้ผู้ใช้กด Connect Google Drive & Sheets และให้ consent
7. เมื่อพร้อมแล้วเข้าสู่ My Visual Builder เดิม
8. Builder ใช้ owner identity เพื่อเข้าถึง Drive/Sheets ของเจ้าของคนนั้น

Login ไม่ได้แปลว่า Google Drive/Sheets ได้รับอนุญาตแล้ว ต้องแสดงสถานะให้ชัด

## Landing Page structure
### Header
Builly logo, Product, Features, How it works, Data ownership, Sign in, CTA Start Building. Mobile navigation ต้อง accessible

### Hero
Big hero headline เช่น “Build your website. Your way.”
ข้อความอธิบาย Visual Builder, primary CTA Start Building, secondary CTA Explore Features และ product preview ที่แสดงหน้าตา Visual Builder จริง

### Feature sections
- Visual freedom: จัดวางและปรับแต่งหน้าเว็บ
- Responsive design: Desktop / Tablet / Mobile
- Pages & CMS: หลายหน้าและข้อมูลเนื้อหา
- Your data, your workspace: ใช้ Drive/Sheets ของผู้ใช้เป็นพื้นที่ข้อมูลหลัก

### How it works
1. Sign in with Google
2. Connect your Drive & Sheets
3. Build and customize
4. Publish your website

### Data ownership
อธิบายว่า Supabase ใช้สำหรับ identity/session ส่วน Google Drive/Sheets เป็นพื้นที่เก็บข้อมูลเว็บไซต์ของผู้ใช้ ห้ามกล่าวอ้าง security/privacy ที่ยังไม่ได้ implement และตรวจสอบ

## Professional Spatial UI direction
Mood: Professional, premium, modern, creative technology, spatial, confident, welcoming.

### 60/30/10 palette
- 60% Soft Porcelain `#F7F6FA`: page background / whitespace
- 30% Deep Plum `#211B2E`: typography / dark surfaces
- 10% Electric Violet `#6C2CEB`: CTA / active state / highlights

### Techniques
- Big Hero Type และ editorial hierarchy
- Spatial cards, subtle depth, layered panels, controlled shadows
- Holographic texture เป็น accent เบามาก
- Radial gradients และ restrained violet/lilac gradients
- Lucide outline icons ใช้แทน emoji
- Motion เบาและมีเหตุผล รองรับ `prefers-reduced-motion`
- หลีกเลี่ยง glassmorphism, neon, gradient และ floating cards ที่มากเกินไป

ใช้ logo/font assets เดิมถ้ามี ห้ามสร้าง logo ใหม่เอง

## Responsive & accessibility
Desktop / tablet / mobile layout; semantic headings; keyboard navigation; visible focus; contrast เพียงพอ; accessible labels; loading/error/disabled states; ไม่ใช้สีอย่างเดียวสื่อสถานะ

## Routing
- `/` = public Landing Page
- `/login` หรือ auth modal = sign-in entry
- Existing Visual Builder route/deep links ต้องคงอยู่
- หลัง login และเชื่อม Workspace ตามที่จำเป็น ให้เข้า Builder เดิม
- ผู้ใช้ที่ login แล้วกลับ `/` ควรเห็น “Open My Builder”
- รักษา route pattern เดิมที่ใช้งานได้ อย่าทำ deep links เสีย

## Acceptance
Landing Page เป็นหน้าแรก, CTA เริ่ม Google sign-in, identity เป็นเจ้าของ Builder, Workspace consent แยกชัด, user A เข้าถึง Drive/Sheets ของ user B ไม่ได้ และ Builder/CMS เดิมยังทำงาน
