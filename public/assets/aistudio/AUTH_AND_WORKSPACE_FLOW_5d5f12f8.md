# Builly — Authentication & Google Workspace Flow

## 1. แยกสอง authorization

### Builly sign-in
- Google sign-in ผ่าน Supabase Auth
- ใช้ Supabase user ID เป็น stable Builly owner ID
- Supabase จัดการ identity/session เท่านั้น
- ไม่ขอ broad Drive/Sheets scopes ในขั้น login

### Google Workspace connection
- ผู้ใช้กด Connect Google Workspace เอง
- ขอ Google OAuth consent สำหรับ Drive/Sheets scopes ที่จำเป็น
- ห้ามสมมติว่า Google account ที่ใช้ login เป็น account เดียวกับ Workspace
- ผูก Workspace credential กับ Builly owner หลังตรวจสอบ session แล้ว
- Frontend ได้เฉพาะ connection status และ safe account metadata

## 2. OAuth lifecycle
1. Frontend เรียก `/api/google/oauth/start` พร้อม Builly session
2. Worker verify session และสร้าง high-entropy, short-lived, single-use OAuth state
3. Redirect ไป Google consent ด้วย redirect URI ที่กำหนด
4. Google callback กลับ Worker
5. Worker validate state/expiry/one-time use และแลก authorization code ฝั่ง server
6. เก็บ refresh credential แบบ encrypted
7. ส่งผู้ใช้กลับ app โดยไม่มี token ใน response
8. Frontend ขอ connection status
9. Drive/Sheets calls ใช้ owner-bound credential ฝั่ง server

## 3. Credential security
- ห้าม refresh token, client secret, encryption key หรือ Supabase service-role key อยู่ใน `VITE_*`
- ห้ามเก็บ refresh token ใน localStorage/sessionStorage/IndexedDB/frontend state
- ห้ามส่ง token กลับ browser หรือ log secret
- เข้ารหัส refresh credential ก่อนจัดเก็บ; Cloudflare D1 ใช้เก็บ ciphertext และ technical metadata ได้ โดย encryption key อยู่ Worker Secrets
- D1 ไม่ใช่ portfolio database
- รองรับ refresh, reauthorization, revocation, disconnect และ deletion
- ป้องกัน CSRF/replay ด้วย state; ใช้ PKCE เมื่อเหมาะสม
- จำกัด redirect URI/origin และขอ scope เท่าที่จำเป็น

## 4. UX states
Signed out → Continue with Google
Signed in, Workspace disconnected → Connect Google Drive & Sheets
Connecting → progress state
Connected → show safe account metadata + Continue to My Builder
Consent cancelled → retry
Missing scopes/revoked token → reconnect guidance
Different Google account → แจ้ง account ที่ login กับ account ที่เชื่อม Workspace ให้ชัด

## 5. Logout
Sign out จาก Builly ต้องจบ Supabase session แต่ไม่ revoke Google Workspace grant โดยอัตโนมัติ การ Disconnect เป็น action แยก

## 6. Authorization
ทุก private Worker endpoint verify Supabase session และ derive owner ID จาก verified identity เท่านั้น ห้ามเชื่อ owner ID ที่ client ส่งมาเป็น authorization ทุก Drive/Sheets operation ต้องใช้ credential ของ owner นั้น และตรวจสิทธิ์ file access ก่อนใช้ file ID
