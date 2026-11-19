import React, { useState } from 'react';
import { BuillyLogo } from '../components/common/BuillyLogo';
import { FileText, ShieldCheck, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface TermsOfServicePageProps {
  onNavigate: (to: string) => void;
}

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({ onNavigate }) => {
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
            onClick={() => onNavigate('/privacy')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-semibold text-[#4A435C] hover:bg-[#F7F6FA]"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'Privacy Policy' : 'นโยบายความเป็นส่วนตัว'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* Document Title Banner */}
        <div className="bg-white rounded-2xl border border-[#211B2E]/10 p-8 sm:p-10 shadow-sm space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6C2CEB]/10 text-[#6C2CEB] text-xs font-semibold">
            <FileText className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'Legal Agreement' : 'ข้อตกลงทางกฎหมาย'}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-['Outfit',sans-serif] tracking-tight text-[#211B2E]">
            {lang === 'en' ? 'Terms of Service' : 'เงื่อนไขการให้บริการ'}
          </h1>
          <p className="text-sm sm:text-base text-[#4A435C] leading-relaxed">
            {lang === 'en'
              ? 'Welcome to Builly, operated by IndyShares. Please read these Terms of Service carefully before using our visual builder, workspace, CMS, and publishing platform.'
              : 'ยินดีต้อนรับสู่ Builly ดำเนินการโดย IndyShares โปรดอ่านเงื่อนไขการให้บริการเหล่านี้อย่างละเอียดก่อนใช้งานเครื่องมือสร้างพื้นที่ทำงาน ระบบ CMS และแพลตฟอร์มเผยแพร่ของเรา'}
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
                  1. Acceptance of Terms
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  By accessing or using Builly, you agree to be bound by these Terms of Service. If you are using Builly on behalf of an organization or entity, you represent that you have the authority to bind that entity to these terms.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  2. User Content and Data Ownership
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  You retain full ownership of all content, data, websites, CMS datasets, and assets you create, upload, or store in your Builly workspace and Google Drive. Builly does not claim ownership over your user-owned business data. You grant Builly only the limited operational rights necessary to host, secure, build, and publish your workspace according to your instructions.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  3. Google Workspace Integration
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly integrates with Google Workspace via explicit user authorization. You are responsible for maintaining the security of your Google account and ensuring that you have legal rights to connect and manage the Google Drive folders and Spreadsheets utilized by your workspace.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  4. Acceptable Use and Prohibited Conduct
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  You agree not to misuse Builly or assist any third party in:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li>Uploading malicious code, viruses, or attempting to compromise platform security.</li>
                  <li>Publishing unlawful, defamatory, infringing, or fraudulent content.</li>
                  <li>Violating the intellectual property or privacy rights of others.</li>
                  <li>Using automated scraping or overloading our Cloudflare Workers and shared runtimes.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  5. Public Websites and Publishing
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  When you publish a website using Builly, designated public content and static assets become accessible to visitors over the internet. You are solely responsible for ensuring that your published websites, forms, and privacy disclosures comply with applicable local and international laws.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  6. Limitation of Liability
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly and IndyShares are provided on an "as is" and "as available" basis without warranties of any kind. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability to use the platform.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  7. Changes to These Terms
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  We may modify these Terms of Service from time to time. Continued use of Builly after updates constitutes your acceptance of the revised terms.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  8. Contact Information
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  If you have any questions regarding these Terms of Service, please contact us at <a href="mailto:indysharesstudio@gmail.com" className="text-[#6C2CEB] font-semibold hover:underline">indysharesstudio@gmail.com</a>.
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  1. การยอมรับเงื่อนไข
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  โดยการเข้าถึงหรือใช้งาน Builly คุณตกลงที่จะผูกพันตามเงื่อนไขการให้บริการเหล่านี้ หากคุณใช้งานในนามขององค์กรหรือนิติบุคคล คุณรับรองว่าคุณมีอำนาจผูกพันนิติบุคคลนั้นตามเงื่อนไขเหล่านี้
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  2. สิทธิ์ความเป็นเจ้าของเนื้อหาและข้อมูล
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  คุณยังคงความเป็นเจ้าของเนื้อหา ข้อมูล เว็บไซต์ ชุดข้อมูล CMS และสินทรัพย์ทั้งหมดที่คุณสร้าง อัปโหลด หรือจัดเก็บไว้ในพื้นที่ทำงาน Builly และ Google Drive ของคุณ Builly จะไม่กล่าวอ้างสิทธิ์ความเป็นเจ้าของเหนือข้อมูลทางธุรกิจของคุณ คุณมอบสิทธิ์การดำเนินงานที่จำเป็นจำกัดให้แก่ Builly เพื่อโฮสต์ รักษาความปลอดภัย สร้าง และเผยแพร่พื้นที่ทำงานของคุณตามคำแนะนำของคุณเท่านั้น
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  3. การบูรณาการ Google Workspace
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly ผสานการทำงานกับ Google Workspace ผ่านการอนุญาตที่ชัดเจนจากผู้ใช้ คุณมีหน้าที่รับผิดชอบในการรักษาความปลอดภัยของบัญชี Google ของคุณ และดูแลให้คุณมีสิทธิ์ทางกฎหมายในการเชื่อมต่อและจัดการโฟลเดอร์ Google Drive และสเปรดชีตที่ใช้งานโดยพื้นที่ทำงานของคุณ
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  4. การใช้งานที่ยอมรับได้และการกระทำต้องห้าม
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  คุณตกลงที่จะไม่ใช้งาน Builly ในทางที่ผิดหรือช่วยเหลือบุคคลภายนอกในการ:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm text-[#4A435C]">
                  <li>อัปโหลดโค้ดที่เป็นอันตราย ไวรัส หรือพยายามเจาะระบบความปลอดภัยของแพลตฟอร์ม</li>
                  <li>เผยแพร่เนื้อหาที่ผิดกฎหมาย หมิ่นประมาท ละเมิดลิขสิทธิ์ หรือฉ้อโกง</li>
                  <li>ละเมิดสิทธิ์ในทรัพย์สินทางปัญญาหรือความเป็นส่วนตัวของผู้อื่น</li>
                  <li>ใช้สคริปต์อัตโนมัติในการดึงข้อมูลหรือทำให้ Cloudflare Workers และรันไทม์ของเราทำงานหนักเกินไป</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  5. เว็บไซต์สาธารณะและการเผยแพร่
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  เมื่อคุณเผยแพร่เว็บไซต์โดยใช้ Builly เนื้อหาและสินทรัพย์สาธารณะที่กำหนดจะสามารถเข้าถึงได้โดยผู้เยี่ยมชมผ่านอินเทอร์เน็ต คุณมีหน้าที่รับผิดชอบแต่เพียงผู้เดียวในการดูแลให้เว็บไซต์ แบบฟอร์ม และการเปิดเผยความเป็นส่วนตัวที่คุณเผยแพร่สอดคล้องกับกฎหมายท้องถิ่นและระหว่างประเทศที่เกี่ยวข้อง
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  6. การจำกัดความรับผิด
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  Builly และ IndySharesให้บริการตาม "สภาพที่เป็นอยู่" (as is) และ "ตามที่มีอยู่" (as available) โดยไม่มีการรับประกันใดๆ เราจะไม่รับผิดชอบต่อความเสียหายทางอ้อม ความเสียหายโดยบังเอิญ ความเสียหายพิเศษ ความเสียหายต่อเนื่อง หรือความเสียหายเชิงลงโทษใดๆ ที่เกิดจากการใช้งานหรือความไม่สามารถใช้งานแพลตฟอร์มของคุณ
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  7. การเปลี่ยนแปลงเงื่อนไข
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  เราอาจแก้ไขเงื่อนไขการให้บริการเหล่านี้เป็นครั้งคราว การใช้งาน Builly อย่างต่อเนื่องหลังจากการอัปเดตถือเป็นการยอมรับเงื่อนไขที่แก้ไขแล้วของคุณ
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold font-['Outfit',sans-serif] text-[#211B2E] border-b border-[#211B2E]/10 pb-2">
                  8. ข้อมูลติดต่อ
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  หากคุณมีคำถามใดๆ เกี่ยวกับเงื่อนไขการให้บริการเหล่านี้ โปรดติดต่อเราที่ <a href="mailto:indysharesstudio@gmail.com" className="text-[#6C2CEB] font-semibold hover:underline">indysharesstudio@gmail.com</a>
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
          <button type="button" onClick={() => onNavigate('/privacy')} className="hover:text-[#211B2E]">
            {lang === 'en' ? 'Privacy Policy' : 'นโยบายความเป็นส่วนตัว'}
          </button>
          <span>•</span>
          <button type="button" onClick={() => onNavigate('/terms')} className="hover:text-[#211B2E] font-semibold">
            {lang === 'en' ? 'Terms of Service' : 'เงื่อนไขการให้บริการ'}
          </button>
        </div>
        <p>© 2026 IndyShares / Builly. All rights reserved.</p>
      </footer>
    </div>
  );
};
