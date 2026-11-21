[README.md](https://github.com/user-attachments/files/35217690/README.md)
# Builly

Builly เป็นเครื่องมือจัดการเว็บไซต์และโปรเจกต์แบบภาพสำหรับสร้าง Portfolio และเว็บไซต์แบบปรับแต่งได้ โดยเน้นการออกแบบแบบ Freeform, ตัวแก้ไขที่ใช้งานง่าย และการจัดเก็บข้อมูลที่ผู้ใช้งานควบคุมเองผ่าน Google Workspace

> สร้างจัดวางปรับแต่งรูปแบบ เลือกธีม และดูตัวอย่างการทำงานได้อย่างเป็นระบบจากเครื่องมือเดียว

**หมายเหตุ:** ข้อมูลในเอกสารนี้อิงตามโค้ดและไฟล์การตั้งค่าของโปรเจกต์ในปัจจุบัน

---

## ภาพรวม

Builly รวมฟังก์ชันสำหรับ:

- ตัวแก้ไขหน้าเว็บแบบลากวางและปรับแต่งตำแหน่งอิสระ
- ระบบจัดการโปรเจกต์และหน้าเว็บไซต์
- ธีมและชุดรูปแบบสไตล์ที่ปรับแต่งได้
- ระบบ CMS สำหรับจัดการเนื้อหาและชุดข้อมูล
- การส่งออกโค้ดเว็บไซต์
- ระบบยืนยันตัวตนผ่าน Supabase
- การเชื่อมต่อ Google Workspace
- การจัดเก็บข้อมูลใน Google Sheets และ Google Drive
- การแก้ไขร่วมกันแบบแยกข้อมูล workspace ตาม project และ owner
- การกำหนดรูปแบบหน้าให้รองรับหลาย breakpoint
- การบันทึก draft แบบ local เมื่อ backend ยังไม่พร้อมใช้งาน
- การประมวลผลและสร้างเนื้อหาโดยใช้ Gemini API บนฝั่ง server

---

## คุณสมบัติหลัก

### Visual Builder

- คัดลอก ย้าย จัดกลุ่ม และลบ component
- Undo / Redo
- Preview และ responsive editing
- ควบคุม layout ผ่าน property panel
- จัดการธีม การตั้งค่า และตัวแปรสไตล์
- แสดงโครงสร้าง component แบบ hierarchy tree
- บันทึกและกู้คืน draft จาก Local Storage
- ส่งออกหน้าเป็น HTML/CSS หรือโครงสร้าง source ที่ใช้งานต่อได้

### Project Management

- สร้างและจัดการ workspace
- สร้างและจัดการ project
- แยกหน้าและข้อมูลตาม project
- แสดงสถานะของหน้าและ assets
- จัดการข้อมูลในลักษณะ multi-page
- รองรับการทำงานผ่าน user-owned workspace

### CMS และเนื้อหา

- สร้าง collection และข้อมูล CMS
- จัดการตัวแบบและ content schema
- เชื่อมข้อมูลกับหน้าและ component
- จัดการ dynamic content
- Export และนำเข้าข้อมูลรูปแบบโครงสร้าง

### Google Workspace

- เชื่อมต่อบัญชี Google โดยแยกจากบัญชีสำหรับ login
- ใช้ Google Sheets สำหรับจัดเก็บข้อมูล
- ใช้ Google Drive สำหรับจัดเก็บไฟล์และ registry
- เปิดใช้งานบัญชี Google Account สองบัญชีแยกกันได้
- เข้ารหัส refresh token ผ่าน AES-256-GCM
- เก็บ OAuth credentials ใน Cloudflare D1
- แยกข้อมูลตาม owner, project และ workspace

### Authentication

- Authentication ผ่าน Supabase
- ใช้ Google Sign-In
- จำแนก identity ของผู้ใช้โดยใช้ `supabaseUser.id`
- อนุญาตให้เปิดหน้า builder ผ่านระบบ protected route
- รองรับ local draft preview เมื่อยังไม่ได้กำหนด Supabase

---

## เทคโนโลยีที่ใช้

### Frontend

- React 19
- TypeScript
- Vite 8
- Tailwind CSS 4
- Motion
- i18next / react-i18next
- Lucide React
- Vitest

### Backend และ Infrastructure

- Cloudflare Workers
- Cloudflare D1
- Cloudflare Durable Objects
- Cloudflare Static Assets
- Supabase Authentication
- Google OAuth 2.0
- Google Sheets API
- Google Drive API
- Gemini API

### เครื่องมือพัฒนา

- Bun lockfile
- npm scripts
- Wrangler
- TypeScript 7 สำหรับ frontend
- TypeScript 5 สำหรับ worker
- Vitest
- ESLint หรือรูปแบบ type checking ที่อิง TypeScript

---

## โครงสร้างโปรเจกต์

```text
Builly/
├── src/                       # React application และ frontend source
│   ├── assets/                # Static assets ของ frontend
│   ├── components/            # Shared UI และ editor components
│   │   ├── builder/
│   │   ├── cms/
│   │   ├── common/
│   │   ├── console/
│   │   ├── modals/
│   │   └── sheets/
│   ├── contexts/              # React contexts
│   ├── data/                  # ข้อมูลเริ่มต้นและค่าคงที่
│   ├── features/              # Authentication, console และ workspace connection
│   ├── i18n/                  # การตั้งค่าภาษาและ translation
│   ├── locales/               # ไฟล์ localization
│   ├── pages/                 # หน้า application หลัก
│   ├── services/              # API, storage, compiler และ integration services
│   ├── types/                 # ประเภทและ interface ของ TypeScript
│   └── utils/                 # ฟังก์ชันช่วยเหลือ
├── worker/
│   ├── src/                   # Cloudflare Worker source
│   └── migrations/            # D1 database migrations
├── docs/                      # เอกสารการติดตั้งและ migration
├── public/                    # Public assets
├── package.json
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml              # การตั้งค่า Cloudflare unified deployment
├── .env.example
└── LICENSE
