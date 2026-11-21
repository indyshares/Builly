```markdown name=README.md
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
```

---

## หน้าและ Route หลัก

| Route | หน้าที่ |
|---|---|
| `/` | หน้า Landing Page |
| `/login` | เข้าสู่ระบบหรือคู่มือการตั้งค่า Supabase |
| `/auth/callback` | Callback หลังทำ Supabase authentication |
| `/app` | หน้าตัวแก้ไขเว็บไซต์ |
| `/builder` | Visual Builder สำหรับสร้างและแก้ไขหน้า |
| `/editor` | ทางลัดหรือโหมดแก้ไขการออกแบบ |
| `/console` | ส่วนจัดการ workspace และ project |
| `/workspace` | เชื่อมต่อและตรวจสอบสถานะ Google Workspace |
| `/site/:slug` | เปิดดูเว็บไซต์ที่ publish |
| `/privacy` | นโยบายความเป็นส่วนตัว |
| `/terms` | เงื่อนไขการให้บริการ |

Route และสถานะการแสดงผลอาจมีการปรับเปลี่ยนเพิ่มเติมตามการตั้งค่าของ Auth และ Workspace

---

## ความต้องการของระบบ

สำหรับการพัฒนาบนเครื่องผู้ใช้:

- Node.js 20 หรือใหม่กว่า
- npm หรือ Bun
- Cloudflare account สำหรับ deploy Worker
- Supabase project สำหรับ Authentication
- Google Cloud project สำหรับ OAuth
- Cloudflare D1 database
- Gemini API Key หากต้องการใช้ฟีเจอร์ AI
- Browser ที่รองรับ ES modules และ modern web APIs

---

## เริ่มใช้งาน

### 1. Clone repository

```bash
git clone https://github.com/indyshares/Builly.git
cd Builly
```

### 2. ติดตั้ง dependencies

```bash
npm install
```

สามารถใช้ Bun สำหรับการพัฒนาได้เช่นกัน:

```bash
bun install
```

### 3. สร้างไฟล์ environment

```bash
cp .env.example .env.local
```

แก้ไข `.env.local` และใส่ค่าที่ได้รับจาก Supabase, Google Cloud และ Worker:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_PUBLIC_ANON_KEY"

VITE_GOOGLE_OAUTH_CLIENT_ID="YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
VITE_GOOGLE_WORKSPACE_SCOPES="https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/drive.metadata.readonly"

VITE_WORKER_API_URL=""
VITE_APP_URL="http://localhost:3000"
VITE_INDYSHARES_DRIVE_FOLDER_NAME="Builly"
VITE_INDYSHARES_SCHEMA_VERSION="2.0"
```

เมื่อรันด้วย Cloudflare Worker แบบ single origin ให้ตั้ง `VITE_WORKER_API_URL=""`

ห้ามใส่ค่าสำหรับ service role key หรือ OAuth client secret ใน environment ที่ขึ้นต้นด้วย `VITE_*`

### 4. รัน development server

```bash
npm run dev
```

โปรเจกต์จะเปิดที่:

```text
http://localhost:3000
```

---

## คำสั่งที่มีให้ใช้งาน

```bash
npm run dev
```

รัน Vite development server บนพอร์ต 3000

```bash
npm run build
```

สร้าง production bundle ไปยังโฟลเดอร์ `dist`

```bash
npm run preview
```

เปิด preview สำหรับ production build

```bash
npm run lint
```

ตรวจสอบ TypeScript แบบไม่สร้างไฟล์ผลลัพธ์

```bash
npm run typecheck:worker
```

ตรวจสอบโค้ด Cloudflare Worker

```bash
npm run test
```

รันชุดทดสอบด้วย Vitest

```bash
npm run clean
```

ลบไฟล์ build และไฟล์ server.js

---

## การตั้งค่า Supabase Authentication

1. เปิด Supabase Dashboard
2. ไปที่ **Authentication → Providers → Google**
3. เปิด Google Sign-In
4. เพิ่ม redirect URL:

```text
http://localhost:3000/auth/callback
https://<YOUR_DOMAIN>/auth/callback
```

5. เพิ่มค่า Supabase public URL และ anon key ใน `.env.local`

ค่าที่ฝังใน frontend ควรเป็น public anon key เท่านั้น ห้ามใช้ service role key

Supabase ใช้เพื่ออธิบาย identity ของผู้ใช้งานเท่านั้น ข้อมูล portfolio, workspace, theme และไฟล์ CMS ไม่ควรเก็บเป็นหลักใน Supabase ในสถานการณ์ที่ระบบมีการแยก storage ตาม Google Workspace

---

## การตั้งค่า Google OAuth

### สร้าง OAuth 2.0 Client

ใน Google Cloud Console:

1. สร้าง OAuth 2.0 Client ID
2. เลือกประเภท Web application
3. เพิ่ม Authorized JavaScript Origins

```text
http://localhost:3000
https://<YOUR_DOMAIN>
```

4. เพิ่ม Authorized Redirect URI

```text
http://localhost:3000/api/google/oauth/callback
https://<YOUR_DOMAIN>/api/google/oauth/callback
```

การเชื่อมต่อ Google ใช้ scopes ต่อไปนี้:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata.readonly
```

---

## การตั้งค่า Cloudflare Worker และ D1

ตรวจสอบไฟล์:

- `wrangler.toml`
- `worker/wrangler.toml`
- `worker/migrations/`

สร้าง D1 database:

```bash
npx wrangler d1 create builly_oauth_vault
```

แล้วนำ database ID ที่ได้ไปใส่ใน `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "builly"
database_id = "YOUR_D1_DATABASE_ID"
migrations_dir = "worker/migrations"
```

ใช้ migration:

```bash
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
```

ตั้งค่าระบบผ่าน Wrangler:

```bash
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put SUPABASE_ANON_KEY
```

สร้าง encryption key ขนาด 32 bytes แบบ base64:

```bash
openssl rand -base64 32
```

จากนั้นเพิ่ม Worker variables เช่น:

```text
SUPABASE_URL
ALLOWED_FRONTEND_ORIGINS
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_WORKSPACE_SCOPES
```

ตัวอย่าง:

```text
ALLOWED_FRONTEND_ORIGINS=https://builly.indyshares.com,http://localhost:3000
GOOGLE_OAUTH_REDIRECT_URI=https://builly.indyshares.com/api/google/oauth/callback
```

---

## การ Deploy ด้วย Cloudflare

### Build และ deploy แบบ unified

```bash
npm run cf:build
npm run cf:deploy
```

หรือรันคำสั่งเดี่ยว:

```bash
npm run cf:deploy
```

### รัน Cloudflare Worker บนเครื่อง

```bash
npm run cf:dev
```

คำสั่งนี้จะ build frontend แล้วรัน wrangler dev

### Deploy แยก worker กับ frontend

ถ้า deploy Worker แยกส่วน ให้ตั้งค่า:

```env
VITE_WORKER_API_URL="https://YOUR_WORKER.workers.dev"
```

ตัวอย่าง:

```text
https://builly-project.mycloudsfireworks.workers.dev
```

สำหรับ Worker เดี่ยว:

```bash
cd worker
npm install
npm run deploy
```

---

## การทดสอบ

รัน unit test และ integration test ที่รองรับอยู่ในโปรเจกต์:

```bash
npm run test
```

ชุดทดสอบหลักอยู่ใน:

```text
src/**/__tests__/
src/pages/__tests__/
src/services/__tests__/
src/features/**/__tests__/
```

ตรวจสอบชนิดข้อมูลก่อนสร้าง production build:

```bash
npm run lint
npm run typecheck:worker
npm run build
```

---

## โครงสร้างสถาปัตยกรรม

```text
Browser
  │
  ├── React + Vite
  │     ├── Visual Builder
  │     ├── CMS
  │     ├── Themes
  │     └── Local Draft Storage
  │
  ├── Supabase Auth
  │     └── User Identity
  │
  └── Cloudflare Worker
        ├── OAuth callbacks
        ├── Token encryption
        ├── Workspace registry
        ├── Google APIs
        ├── D1 database
        └── Durable Object locks
                    │
                    ▼
             Google Workspace
             ├── Google Sheets
             └── Google Drive
```

---

## ความปลอดภัย

โปรเจกต์ออกแบบให้แยก identity และข้อมูลตาม owner:

- Supabase เก็บ identity และ authentication
- Google Workspace OAuth มีการจัดการแยกจาก Supabase login
- Refresh token ถูกเข้ารหัสก่อนเก็บใน D1
- Client ไม่ควรได้รับ refresh token
- Public environment variables ต้องไม่มี secret
- OAuth client secret ควรเก็บเป็น Worker secret
- Encryption key ห้าม commit ลง Git
- เพิ่ม allowed origins เพื่อจำกัดการเรียก API จาก domain ที่อนุญาต
- Data ของ workspace ต้องจำแนกตาม owner และ project
- ใช้ Durable Object lock เพื่อป้องกันการแก้ไขหรือ registry operations ที่ชนกัน

---

## ข้อจำกัดและสถานะการพัฒนา

ระบบอาจมีข้อจำกัดดังนี้:

- Google Workspace OAuth ต้องมี Worker และ D1 ที่ถูก deploy
- Supabase เป็น optional เมื่อเปิด local preview
- การรันในโหมด local โดยไม่มี Supabase จะไม่สร้าง fake login
- Client-side Google Workspace flow บางส่วนอาจยังทำงานอยู่ระหว่าง migration ไปยัง Worker proxy
- การ publish ไฟล์หรือ assets จริงอาจต้องตั้งค่า D1, Google Drive และ Cloudflare R2
- ค่าคอนฟิกบางส่วนใน `wrangler.toml` ต้องปรับให้ตรงกับ domain และ D1 database ของผู้ใช้งาน
- ฟีเจอร์ที่เกี่ยวกับ Gemini ต้องกำหนด server-side API key อย่างปลอดภัย

รายละเอียด migration มีอยู่ใน:

- [`docs/SETUP_AND_MIGRATION.md`](./docs/SETUP_AND_MIGRATION.md)
- `BUILDER_FEATURE_INVENTORY.md`
- `WORKSPACE_ARCHITECTURE_AUDIT.md`
- `CMS_RELIABILITY_AUDIT.md`
- `SHARED_RUNTIME_AUDIT.md`
- `REDESIGN_AUDIT.md`
- `SHEET_STRUCTURE_INVENTORY.md`
- `BUILDER_AUDIT_ARCHITECTURE_AND_PLAN.md`
- `BUILDER_QA_TEST_PLAN.md`

---

## การมีส่วนร่วม

การมีส่วนร่วมในโปรเจกต์สามารถทำได้ด้วยขั้นตอน:

1. Fork repository
2. สร้าง branch ใหม่

```bash
git checkout -b feature/my-feature
```

3. พัฒนาและแก้ไขโค้ด
4. รัน typecheck และ test

```bash
npm run lint
npm run typecheck:worker
npm run test
npm run build
```

5. สร้าง Pull Request พร้อมคำอธิบายการเปลี่ยนแปลงให้ชัดเจน
6. ระบุการทดสอบที่ทำใน Pull Request

แนะนำให้ตรวจสอบให้แน่ใจว่า:

- ไม่มี API secret หรือ private key ในโค้ด
- ไม่มีการเก็บข้อมูลผู้ใช้โดยไม่จำเป็น
- ไม่มี breaking change โดยไม่ได้อธิบายผลกระทบ
- โค้ดผ่าน test และ build
- อัปเดตเอกสารหากเพิ่ม environment variable หรือ route ใหม่

---

## License

Builly ใช้ GNU General Public License v3.0

ดูรายละเอียดที่ [LICENSE](./LICENSE)

---

## ผู้พัฒนาและอ้างอิง

- Repository: [indyshares/Builly](https://github.com/indyshares/Builly)
- ผู้ดูแล: [indyshares](https://github.com/indyshares)
- ภาษาโปรเจกต์หลัก: TypeScript
- Runtime: React และ Cloudflare Workers
- License: GPL-3.0
````
