import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VerticalScrollSliderProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  maxHeight?: number | string;
}

export const VerticalScrollSlider: React.FC<VerticalScrollSliderProps> = ({
  children,
  className = '',
  containerClassName = '',
  maxHeight = 320,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(40);
  const [showSlider, setShowSlider] = useState(false);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartThumbTop = useRef(0);
  const dragStartScrollTop = useRef(0);

  const heightValue = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  const updateThumb = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollHeight, clientHeight, scrollTop } = el;
    const needsSlider = scrollHeight > clientHeight + 1;
    setShowSlider(needsSlider);
    if (!needsSlider) return;

    const ratio = clientHeight / scrollHeight;
    const height = Math.max(32, clientHeight * ratio);
    const maxThumbTop = clientHeight - height;
    const top = maxThumbTop > 0 ? (scrollTop / (scrollHeight - clientHeight)) * maxThumbTop : 0;
    setThumbHeight(height);
    setThumbTop(top);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateThumb();
    el.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', updateThumb);
    // 子元素高度可能异步变化，兜底刷新
    const observer = new ResizeObserver(updateThumb);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateThumb);
      window.removeEventListener('resize', updateThumb);
      observer.disconnect();
    };
  }, [updateThumb]);

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartThumbTop.current = thumbTop;
    dragStartScrollTop.current = containerRef.current?.scrollTop || 0;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    dragStartY.current = e.touches[0].clientY;
    dragStartThumbTop.current = thumbTop;
    dragStartScrollTop.current = containerRef.current?.scrollTop || 0;
    e.stopPropagation();
  };

  useEffect(() => {
    if (!isDragging.current) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const delta = clientY - dragStartY.current;
      const el = containerRef.current;
      if (!el) return;
      const { clientHeight, scrollHeight } = el;
      const maxThumbTop = clientHeight - thumbHeight;
      const newThumbTop = Math.max(0, Math.min(maxThumbTop, dragStartThumbTop.current + delta));
      const scrollRatio = maxThumbTop > 0 ? newThumbTop / maxThumbTop : 0;
      el.scrollTop = scrollRatio * (scrollHeight - clientHeight);
    };
    const handleUp = () => {
      isDragging.current = false;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [thumbHeight, thumbTop]);

  return (
    <div className={`flex gap-2 sm:gap-3 ${className}`}>
      <div
        ref={containerRef}
        className={`flex-1 overflow-y-auto ${containerClassName}`}
        style={{
          maxHeight: heightValue,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>
      {showSlider && (
        <div
          className="w-1.5 sm:w-2 bg-gray-200 rounded-full relative flex-shrink-0"
          style={{ height: heightValue }}
        >
          <div
            className="w-1.5 sm:w-2 bg-orange-500 rounded-full cursor-pointer absolute left-0 touch-none"
            style={{ height: thumbHeight, top: thumbTop }}
            onMouseDown={handleThumbMouseDown}
            onTouchStart={handleTouchStart}
          />
        </div>
      )}
    </div>
  );
};

export default VerticalScrollSlider;
