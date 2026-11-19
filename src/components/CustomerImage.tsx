import { useState, type ReactNode } from 'react';
import { ShoppingBag } from 'lucide-react';

function ImageSequence({ images, alt, className, fallback }: {
  images: string[]; alt: string; className: string; fallback: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  if (!images[index]) {
    return <span role="img" aria-label={alt + '暂无图片'} className={className + ' grid place-items-center bg-[#f7eee4] text-[#99613f]'}>
      {fallback}
    </span>;
  }
  return <img key={index} src={images[index]} alt={alt} loading="lazy" className={className}
    onError={() => setIndex(current => current === index ? current + 1 : current)} />;
}

export default function CustomerImage({ images, alt, className, fallback = <ShoppingBag size={24} /> }: {
  images?: string[]; alt: string; className: string; fallback?: ReactNode;
}) {
  const sources = [...new Set((images || []).filter(Boolean))];
  return <ImageSequence key={JSON.stringify(sources)} images={sources} alt={alt} className={className} fallback={fallback} />;
}
