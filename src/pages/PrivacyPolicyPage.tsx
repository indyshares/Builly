import React, { useState } from 'react';
import { BuillyLogo } from '../components/common/BuillyLogo';
import { ShieldCheck, Lock, ArrowLeft, Globe, FileText, CheckCircle2 } from 'lucide-react';

interface PrivacyPolicyPageProps {
  onNavigate: (to: string) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
  const [lang, setLang] = useState<'en' | 'th'>('en');

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] font-sans selection:bg-[#6C2CEB]/15 selection:text-[#211B2E]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#211B2E]/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2 text-[#4A435C] hover:text-[#211B2E] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <BuillyLogo variant="full" size="sm" theme="light" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-[#211B2E]/15 p-0.5 bg-[#F7F6FA]">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                lang === 'en' ? 'bg-[#6C2CEB] text-white shadow-sm' : 'text-[#4A435C] hover:text-[#211B2E]'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('th')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                lang === 'th' ? 'bg-[#6C2CEB] text-white shadow-sm' : 'text-[#4A435C] hover:text-[#211B2E]'
              }`}
            >
              ไทย (Thai)
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/terms')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-semibold text-[#4A435C] hover:bg-[#F7F6FA]"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'Terms of Service' : 'เงื่อนไขการให้บริการ'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* Document Title Banner */}
        <div className="bg-white rounded-2xl border border-[#211B2E]/10 p-8 sm:p-10 shadow-sm space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6C2CEB]/10 text-[#6C2CEB] text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'Legal & Privacy' : 'กฎหมายและความเป็นส่วนตัว'}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-['Outfit',sans-serif] tracking-tight text-[#211B2E]">
            {lang === 'en' ? 'Privacy Policy' : 'นโยบายความเป็นส่วนตัว'}
          </h1>
          <p className="text-sm sm:text-base text-[#4A435C] leading-relaxed">
            {lang === 'en'
              ? 'At Builly, operated by IndyShares, we respect your privacy and are committed to protecting your personal data and Google Workspace permissions. This Privacy Policy explains how we collect, use, and safeguard your information.'
              : 'ที่ Builly ดำเนินการโดย IndyShares เราเคารพความเป็นส่วนตัวของคุณและมุ่งมั่นที่จะปกป้องข้อมูลส่วนบุคคลและการอนุญาตสิทธิ์ Google Workspace ของคุณ นโยบายความเป็นส่วนตัวนี้อธิบายวิธีที่เราจัดเก็บ ใช้ และปกป้องข้อมูลของคุณ'}
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-[#4A435C]/80 border-t border-[#211B2E]/10 mt-4">
            <span>{lang === 'en' ? 'Effective Date: November 19, 2026' : 'วันที่มีผลบังคับใช้: 19 พฤศจิกายน 2569'}</span>
            <span>•</span>
            <span>{lang === 'en' ? 'Last Updated: November 19, 2026' : 'อัปเดตล่าสุด: 19 พฤศจิกายน 2569'}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="bg-white rounded-2xl border border-[#211B2E]/10 p-8 sm:p-12 shadow-sm space-y-8 text-[#211B2E] leading-relaxed">
          {lang === 'en' ? (
            <>
              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  1. Introduction
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly ("we," "our," or "us") provides a visual workspace builder, content management system (CMS), inbox management, and website publishing platform. We operate on a unique <strong>Google Drive-First architecture</strong> where your business data remains in your own Google Drive rather than being locked into our proprietary database. This Privacy Policy outlines our data practices across our applications and services.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  2. Who We Are
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly is developed and maintained by IndyShares. For privacy inquiries, data requests, or support, you can contact our team at <a href="mailto:indysharesstudio@gmail.com" className="text-[#6C2CEB] font-semibold hover:underline">indysharesstudio@gmail.com</a>.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  3. Scope of This Policy
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  This policy applies to all visitors, registered users, and workspace owners who access our web application, console, builder, and public site runtimes.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  4. Information We Collect
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  We collect only the minimum information necessary to operate Builly securely and reliably:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li><strong>Account & Authentication Information:</strong> Your user ID, email address, and display name provided during Supabase Authentication.</li>
                  <li><strong>Google Workspace Connection Metadata:</strong> Basic profile info (name, email, avatar) and authorized OAuth scopes associated with your connected Google account.</li>
                  <li><strong>Workspace & Operational Logs:</strong> Idempotency keys, operation journals, and projection repair queue records needed to ensure transaction safety and data synchronization.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  5. Google Workspace Data and Permissions
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly connects to Google Workspace via explicit user authorization. We request access strictly to provide workspace features:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li><strong>Google Drive (`drive.file` / `drive.metadata.readonly`):</strong> To create, read, and manage your Builly workspace folders, manifests, project configuration, and published site snapshots under your `My Drive/Builly/` folder.</li>
                  <li><strong>Google Spreadsheets (`spreadsheets`):</strong> To store and synchronize structured CMS datasets and contact form inbox submissions in dedicated Google Spreadsheets created for your workspace.</li>
                </ul>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  We store refresh tokens securely on our server encrypted with AES-256-GCM. Refresh tokens are never exposed to the browser or logged.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  6. Google API Services and Limited Use Disclosure
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-[#6C2CEB] font-semibold hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  7. Data Storage and Drive-First Architecture
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Unlike traditional SaaS platforms that store your data in proprietary silos, Builly implements a Drive-First architecture:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li>Your user-owned business data remains in your Google Drive (`My Drive/Builly/`).</li>
                  <li>Cloudflare D1 is utilized exclusively as a derived, rebuildable operational index and runtime registry.</li>
                  <li>Supabase Auth is used strictly for identity and session management.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  8. Your Privacy Rights and Disconnection
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  You retain full control over your data. You can disconnect your Google Workspace connection at any time from your workspace settings, which revokes server-side token access and stops all synchronization. You can also revoke access directly via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-[#6C2CEB] font-semibold hover:underline">Google Account Permissions</a> page.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  9. Contact Us
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  If you have any questions about this Privacy Policy or our data practices, please contact us at <a href="mailto:indysharesstudio@gmail.com" className="text-[#6C2CEB] font-semibold hover:underline">indysharesstudio@gmail.com</a>.
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  1. บทนำ
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly ("เรา")ให้บริการแพลตฟอร์มสร้างพื้นที่ทำงานภาพ ระบบจัดการเนื้อหา (CMS) กล่องข้อความ และการเผยแพร่เว็บไซต์ เราดำเนินงานบน <strong>สถาปัตยกรรม Google Drive-First</strong> ซึ่งข้อมูลทางธุรกิจของคุณจะอยู่ใน Google Drive ของคุณเอง แทนที่จะถูกจัดเก็บไว้ในฐานข้อมูลปิดของเรา นโยบายความเป็นส่วนตัวนี้อธิบายวิธีที่เราจัดเก็บ ใช้ และปกป้องข้อมูลของคุณ
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  2. เราคือใคร
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly พัฒนาและดูแลโดย IndyShares สำหรับคำถามเกี่ยวกับความเป็นส่วนตัว คำขอข้อมูล หรือการสนับสนุน คุณสามารถติดต่อทีมงานของเราได้ที่ <a href="mailto:indysharesstudio@gmail.com" className="text-[#6C2CEB] font-semibold hover:underline">indysharesstudio@gmail.com</a>
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  3. ขอบเขตของนโยบาย
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  นโยบายนี้มีผลกับผู้เยี่ยมชม ผู้ใช้งานที่ลงทะเบียน และเจ้าของพื้นที่ทำงานทุกคนที่เข้าถึงแอปพลิเคชันเว็บ คอนโซล ตัวสร้าง และรันไทม์เว็บไซต์สาธารณะของเรา
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  4. ข้อมูลที่เราจัดเก็บ
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  เราจัดเก็บเฉพาะข้อมูลที่จำเป็นขั้นต่ำเพื่อให้สามารถใช้งาน Builly ได้อย่างปลอดภัยและเสถียร:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li><strong>ข้อมูลบัญชีและการยืนยันตัวตน:</strong> รหัสผู้ใช้ ที่อยู่อีเมล และชื่อที่แสดงที่ได้รับระหว่างการยืนยันตัวตนผ่าน Supabase Authentication</li>
                  <li><strong>ข้อมูลเมตาการเชื่อมต่อ Google Workspace:</strong> ข้อมูลโปรไฟล์พื้นฐาน (ชื่อ อีเมล รูปโปรไฟล์) และสิทธิ์ OAuth ที่ได้รับอนุญาตที่เชื่อมโยงกับบัญชี Google ของคุณ</li>
                  <li><strong>บันทึกการทำงานและพื้นที่ทำงาน:</strong> คีย์ความสมบูรณ์ บันทึกการดำเนินงาน และคิวซ่อมแซมดัชนีที่จำเป็นเพื่อความปลอดภัยของธุรกรรม</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  5. ข้อมูลและสิทธิ์ Google Workspace
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly เชื่อมต่อกับ Google Workspace ผ่านการอนุญาตที่ชัดเจนจากผู้ใช้ เราขอสิทธิ์เข้าถึงเพื่อให้บริการฟีเจอร์ต่างๆ เท่านั้น:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li><strong>Google Drive (`drive.file` / `drive.metadata.readonly`):</strong> เพื่อสร้าง อ่าน และจัดการโฟลเดอร์พื้นที่ทำงาน Manifest การกำหนดค่าโปรเจกต์ และสแนปชอตเว็บไซต์ที่เผยแพร่ภายใต้โฟลเดอร์ `My Drive/Builly/` ของคุณ</li>
                  <li><strong>Google Spreadsheets (`spreadsheets`):</strong> เพื่อจัดเก็บและซิงโครไนซ์ชุดข้อมูล CMS และการส่งข้อความติดต่อใน Google Spreadsheets ที่สร้างขึ้นสำหรับพื้นที่ทำงานของคุณ</li>
                </ul>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  เราจัดเก็บ Refresh Token บนเซิร์ฟเวอร์อย่างปลอดภัยด้วยการเข้ารหัส AES-256-GCM โดยจะไม่มีการเปิดเผยโทเค็นไปยังเบราว์เซอร์หรือบันทึกลงในログ
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  6. บริการ Google API และนโยบายการใช้งานแบบจำกัด
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  การใช้งานและการถ่ายโอนข้อมูลที่ได้รับจาก Google API ไปยังแอปพลิเคชันอื่นใดของ Builly จะต้องปฏิบัติตาม <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-[#6C2CEB] font-semibold hover:underline">นโยบายข้อมูลผู้ใช้บริการ Google API (Google API Services User Data Policy)</a> รวมถึงข้อกำหนดการใช้งานแบบจำกัด (Limited Use)
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  7. การจัดเก็บข้อมูลและสถาปัตยกรรม Drive-First
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  ต่างจากแพลตฟอร์ม SaaS ทั่วไป Builly ใช้สถาปัตยกรรม Drive-First:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li>ข้อมูลธุรกิจที่เป็นของคุณจะอยู่ใน Google Drive ของคุณเอง (`My Drive/Builly/`)</li>
                  <li>Cloudflare D1 ถูกใช้เป็นดัชนีปฏิบัติการและรีจิสทรีรันไทม์ที่สร้างใหม่ได้เท่านั้น</li>
                  <li>Supabase Auth ใช้สำหรับการจัดการตัวตนและเซสชันเท่านั้น</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  8. สิทธิ์ความเป็นส่วนตัวและการยกเลิกการเชื่อมต่อ
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  คุณมีอำนาจควบคุมข้อมูลของคุณอย่างเต็มที่ คุณสามารถยกเลิกการเชื่อมต่อ Google Workspace ได้ตลอดเวลาจากตั้งค่าพื้นที่ทำงาน ซึ่งจะเพิกถอนการเข้าถึงโทเค็นฝั่งเซิร์ฟเวอร์และหยุดการซิงโครไนซ์ทั้งหมด นอกจากนี้คุณยังสามารถเพิกถอนสิทธิ์ได้โดยตรงผ่านหน้า <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-[#6C2CEB] font-semibold hover:underline">สิทธิ์บัญชี Google ของคุณ</a>
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  9. ติดต่อเรา
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  หากคุณมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัวนี้หรือแนวปฏิบัติด้านข้อมูลของเรา โปรดติดต่อเราที่ <a href="mailto:indysharesstudio@gmail.com" className="text-[#6C2CEB] font-semibold hover:underline">indysharesstudio@gmail.com</a>
                </p>
              </section>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#211B2E]/10 mt-20 py-8 px-4 sm:px-8 text-center text-xs text-[#4A435C] space-y-2">
        <div className="flex items-center justify-center gap-6">
          <button type="button" onClick={() => onNavigate('/')} className="hover:text-[#211B2E]">
            {lang === 'en' ? 'Home' : 'หน้าแรก'}
          </button>
          <span>•</span>
          <button type="button" onClick={() => onNavigate('/privacy')} className="hover:text-[#211B2E] font-semibold">
            {lang === 'en' ? 'Privacy Policy' : 'นโยบายความเป็นส่วนตัว'}
          </button>
          <span>•</span>
          <button type="button" onClick={() => onNavigate('/terms')} className="hover:text-[#211B2E]">
            {lang === 'en' ? 'Terms of Service' : 'เงื่อนไขการให้บริการ'}
          </button>
        </div>
        <p>© 2026 IndyShares / Builly. All rights reserved.</p>
      </footer>
    </div>
  );
};
