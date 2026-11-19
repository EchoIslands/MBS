
import agreement from '../../../mini-program/pages/agreement/agreement.wxml?raw';
import privacy from '../../../mini-program/pages/privacy/privacy.wxml?raw';
import { CustomerHeader } from '../../components/CustomerPage';

type LegalKind = 'agreement' | 'privacy';

export default function Legal({ kind }: { kind: LegalKind }) {
  const title = kind === 'agreement' ? '用户协议' : '隐私政策';
  const document = new DOMParser().parseFromString(kind === 'agreement' ? agreement : privacy, 'text/html');
  const convert = (value: string | null) => (value || '').trim()
    .replace(/\{\{shopName\}\}/g, '皓诗形象设计')
    .replace(/本小程序/g, '本网站')
    .replace(/小程序/g, '网页')
    .replace(/微信登录/g, '手机号登录');
  const backTo = '/customer/profile';
  return <>
    <CustomerHeader title={title} backTo={backTo} />
    <main className="customer-body space-y-3">
      {Array.from(document.querySelectorAll('.' + kind + '-section')).map((section, index) => <section className="customer-card space-y-2" key={index}>
        <h2 className="font-bold">{convert(section.querySelector('.' + kind + '-title')?.textContent || '')}</h2>
        {Array.from(section.children).map((child, childIndex) => {
          if (child.classList.contains(kind + '-title')) return null;
          if (child.classList.contains(kind + '-list')) return <ul key={childIndex} className="list-disc space-y-1 pl-5 text-sm leading-6">
            {Array.from(child.children).filter(item => !/openid/i.test(item.textContent || '')).map((item, itemIndex) => <li key={itemIndex}>{convert(item.textContent)}</li>)}
          </ul>;
          if (child.classList.contains('privacy-contact')) {
            const email = child.querySelector('.contact-text')?.textContent?.trim();
            return email && <a key={childIndex} className="block text-sm font-semibold text-[#805536] underline" href={'mailto:' + email}>{email}</a>;
          }
          if (child.classList.contains(kind + '-text')) return <p key={childIndex} className="text-sm leading-6">{convert(child.textContent)}</p>;
          return null;
        })}
      </section>)}
      <p className="px-2 text-center text-xs text-gray-600">{convert(document.querySelector('.footer-text')?.textContent || '')}</p>
    </main>
  </>;
}
