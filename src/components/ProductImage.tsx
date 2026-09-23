import React from 'react';

export const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
}

const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className }) => (
  <img
    src={src || DEFAULT_PRODUCT_IMAGE}
    alt={alt}
    className={className}
    onError={(e) => {
      if (e.currentTarget.src !== DEFAULT_PRODUCT_IMAGE) {
        e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
      }
    }}
  />
);

export default ProductImage;
